use config::{Config, File, FileFormat};
use dirs::config_dir;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
struct ServerConfig {
    chat_server: String,
    notify_server: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AppConfig {
    server: ServerConfig,
}

impl AppConfig {
    pub fn try_new() -> anyhow::Result<Self> {
        let config_file = config_dir()
            .expect("config file not exists")
            .join("chatapp")
            .join("app.yml");

        let default_config = include_str!("../config/config.default.yml");
        let config = Config::builder()
            .add_source(File::from_str(&default_config, FileFormat::Yaml))
            .add_source(File::with_name(&config_file.to_string_lossy()).required(false))
            .build()?;
        Ok(config.try_deserialize::<AppConfig>()?)
    }
}
