pub mod auth_middleware;
pub mod config;
pub mod control;
pub mod chatbot;
pub mod cxxqt_bridge;
pub mod events;
pub mod gui_server;
pub mod lock;
pub mod logging;
pub mod mdns_broadcaster;
pub mod proxy;
pub mod registry;
pub mod runtime_output;
pub mod runner;
pub mod tray_tooltip;

use std::sync::{Arc, RwLock};
use once_cell::sync::Lazy;

pub static PAIRING_PIN: Lazy<Arc<RwLock<String>>> = Lazy::new(|| Arc::new(RwLock::new(String::new())));
pub static PAIRING_PASSWORD: Lazy<Arc<RwLock<String>>> = Lazy::new(|| Arc::new(RwLock::new(String::new())));
