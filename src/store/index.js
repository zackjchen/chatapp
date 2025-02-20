import { createStore } from 'vuex';
import axios from 'axios';
import { jwtDecode } from "jwt-decode";
import { getUrlBase,initSSE } from '../utils';

async function loadState(response, commit) {
  const token = response.data.token;
  const user = jwtDecode(token); // Decode the JWT to get user info
  const workspace = { id: user.wsId, name: user.wsName };

  try{
    // fetch all  workspace users
    const chatResp = await axios.get(`${getUrlBase()}/users`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const users = chatResp.data;
    console.log("users",users);
    
    const usersMap = {};
    users.forEach((user) => {
      usersMap[user.id] = user;
    });
    const channelResp = await axios.get(`${getUrlBase()}/chat`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const channel = channelResp.data; 
    // Store user info, token, and workspace in localStorage
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    localStorage.setItem('workspace', JSON.stringify(workspace));
    localStorage.setItem('users', JSON.stringify(usersMap));
    localStorage.setItem('channels', JSON.stringify(channel));

    // Commit the mutations to update the state
    commit('setUser', user);
    commit('setToken', token);
    commit('setWorkspace', workspace);
    commit('setChannels', channel);
    commit('setUsers', usersMap);
    return user;

  }catch(e){
    console.error('Failed to fetch users state', e);
    throw e;
  }

}

export default createStore({
  state: {
    user: null,         // User information
    token: null,        // Authentication token
    workspace: {},      // Current workspace
    channels: [],       // List of channels
    messages: {},       // Messages hashmap, keyed by channel ID
    users:{},           // Users hashmap, keyed by user ID
    activeChannel: null, // Active channel
  },
  mutations: {
    setSSE(state, sse) {
      state.sse = sse;
    },
    setUser(state, user) {
      state.user = user;
    },
    setToken(state, token) {
      state.token = token;
    },
    setWorkspace(state, workspace) {
      state.workspace = workspace;
    },
    setChannels(state, channels) {
      state.channels = channels;
    },
    setMessages(state, { channelId, messages }) {
      state.messages[channelId] = messages;    
    },
    setUsers(state, users) {
      state.users = users;
    },
    addChannel(state, channel) {
      state.channels.push(channel);
      state.messages[channel.id] = [];  // Initialize message list for the new channel
    },
    addMessage(state, { channelId, message }) {
      if (state.messages[channelId]) {
        state.messages[channelId].unshift(message);
      } else {
        state.messages[channelId] = [message];
      }
    },
    setActiveChannel(state, channelID) {
      const activeChannel = state.channels.find((c) => c.id === channelID);
      
      state.activeChannel = activeChannel;
    },
    loadUserState(state) {
      const storedUser = localStorage.getItem('user');
      const storedToken = localStorage.getItem('token');
      const storedWorkspace = localStorage.getItem('workspace');
      const storedChannels = localStorage.getItem('channels');
      const storedMessages = localStorage.getItem('messages');
      const storedUsers = localStorage.getItem('users');

      if (storedUser) {
        state.user = JSON.parse(storedUser);
      }
      if (storedToken) {
        state.token = storedToken;
      }
      if (storedWorkspace) {
        state.workspace = JSON.parse(storedWorkspace);
      }
      if (storedChannels) {
        state.channels = JSON.parse(storedChannels);
      }
      if (storedMessages) {
        state.messages = JSON.parse(storedMessages);
      }
      if (storedUsers) {
        state.users = JSON.parse(storedUsers);
      }
    },
  },


  actions: {
    initSSE({ state, commit }) {
      if (state.sse) {
        state.sse.close();
      }
      const sse = initSSE(this);
      commit('setSSE', sse);
    },
    closeSSE({ state, commit }) {
      if (state.sse) {
        state.sse.close();
        commit('setSSE', null);
      }
    },
    async signup({ commit }, { email, fullname, password, workspace }) {
      try {
        const response = await axios.post(`${getUrlBase()}/signup`, {
          email,
          fullname,
          password,
          workspace
        });

        const user = await loadState(response, commit);

        return user;
      } catch (error) {
        console.error('Signup failed:', error);
        throw error;
      }
    },
    setActiveChannel({ commit }, channel) {
      commit('setActiveChannel', channel);
    },
    async signin({ commit }, { email, password }) {
      try {
        const response = await axios.post(`${getUrlBase()}/signin`, {
          email,
          password,
        });
        // 这个commit应该是框架内置的，用于触发mutations
        const user = await loadState(response, commit);
        return user;
      } catch (error) {
        console.error('Login failed:', error);
        throw error;
      }
    },
    logout({ commit }) {
      // Clear local storage and state
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('workspace');
      localStorage.removeItem('channels');
      localStorage.removeItem('messages');

      commit('setUser', null);
      commit('setToken', null);
      commit('setWorkspace', '');
      commit('setChannels', []);
      commit('setMessages', {});

      // close SSE
      this.dispatch('closeSSE');
    },
    addChannel({ commit }, channel) {
      commit('addChannel', channel);

      // Update the channels and messages in local storage
      localStorage.setItem('channels', JSON.stringify(this.state.channels));
      localStorage.setItem('messages', JSON.stringify(this.state.messages));
    },
    async fetchMessagesForChannel({ state, commit }, channelId) {
      if (!state.messages[channelId] || state.messages[channelId].length === 0) {
        try {
          const response = await axios.get(`${getUrlBase()}/chat/${channelId}/messages`, {
            headers: {
              Authorization: `Bearer ${state.token}`,
            },
          });
          /* We should conver sender_id to user object
          [
            {
              "id": 1,
              "chat_id": 1,
              "sender_id": 1,
              "content": "Hello, World!",
              "files": [],
              "created_at": "2024-08-18T04:07:54.087786Z"
            }
          ]
          */
          let messages = response.data;
          commit('setMessages', { channelId, messages });
        } catch (error) {
          console.error(`Failed to fetch messages for channel ${channelId}:`, error);
        }
      }
    },
    async sendMessage({ state, commit }, payload) {
      try {
        const response = await axios.post(`${getUrlBase()}/chat/${payload.chatId}`, payload, {
          headers: {
            Authorization: `Bearer ${state.token}`,
          },
        });
        console.log('Message sent:', response.data);
        // commit('addMessage', { channelId: payload.chatId, message: response.data });
      } catch (error) {
        console.error('Failed to send message:', error);
        throw error;
      }
    },
    addMessage({ commit }, { channelId, message }) {
      commit('addMessage', { channelId, message });

      // Update the messages in local storage
      // localStorage.setItem('messages', JSON.stringify(this.state.messages));
    },
    loadUserState({ commit }) {
      commit('loadUserState');
      if (this.state.token) {
        this.dispatch('initSSE');
      }
    },
  },
  getters: {
    isAuthenticated(state) {
      return !!state.token;
    },
    getUser(state) {
      return state.user;
    },
    getUserById: (state) => (id) => {
      return state.users[id];
    },
    getWorkspace(state) {
      return state.workspace;
    },
    getChannels(state) {   
      return state.channels.filter((channel) => channel.type !== 'single');
    },
    getSingleChannels(state) {
      console.log("state",state.users);
      
      const channels = state.channels.filter((channel) => channel.type === 'single');
      return channels.map((channel) => {               
        const id = channel.members.filter((member) => member !== state.user.id)[0];
        channel.recipient = state.users[id];
        return channel;
      });
    },
    getChannelMessages: (state) => (channelId) => {
      return state.messages[channelId] || [];
    },
    getMessagesForActiveChannel(state) {
      if (!state.activeChannel) {
        return [];
      }      
      
      const messages = state.messages[state.activeChannel.id];

      return messages || []
    }
  },
});
