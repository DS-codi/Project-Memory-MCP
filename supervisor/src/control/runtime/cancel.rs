use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tokio::sync::Mutex;

pub struct CancellationRegistry {
    flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl CancellationRegistry {
    pub fn new() -> Self {
        Self {
            flags: Mutex::new(HashMap::new()),
        }
    }

    pub async fn ensure(&self, session_id: &str) -> Arc<AtomicBool> {
        let mut flags = self.flags.lock().await;
        flags
            .entry(session_id.to_string())
            .or_insert_with(|| Arc::new(AtomicBool::new(false)))
            .clone()
    }

    pub async fn request_cancel(&self, session_id: &str) -> bool {
        let flag = self.ensure(session_id).await;
        let already_cancelled = flag.swap(true, Ordering::SeqCst);
        !already_cancelled
    }

    pub async fn is_cancelled(&self, session_id: &str) -> bool {
        let flag = self.ensure(session_id).await;
        flag.load(Ordering::SeqCst)
    }

    pub async fn clear(&self, session_id: &str) {
        let mut flags = self.flags.lock().await;
        flags.remove(session_id);
    }
}
