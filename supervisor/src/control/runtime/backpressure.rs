use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{Mutex, OwnedSemaphorePermit, Semaphore};

use crate::control::runtime::errors::RuntimeError;

pub struct BackpressureGate {
    semaphore: Arc<Semaphore>,
    queue_limit: usize,
    per_session_inflight_limit: usize,
    queued: Arc<AtomicUsize>,
    in_flight_by_session: Arc<Mutex<HashMap<String, usize>>>,
}

pub struct BackpressureLease {
    _permit: OwnedSemaphorePermit,
    session_id: String,
    queued: Arc<AtomicUsize>,
    in_flight_by_session: Arc<Mutex<HashMap<String, usize>>>,
}

impl Drop for BackpressureLease {
    fn drop(&mut self) {
        self.queued.fetch_sub(1, Ordering::SeqCst);
        let session_id = self.session_id.clone();
        let in_flight = Arc::clone(&self.in_flight_by_session);
        tokio::spawn(async move {
            let mut map = in_flight.lock().await;
            if let Some(count) = map.get_mut(&session_id) {
                *count = count.saturating_sub(1);
                if *count == 0 {
                    map.remove(&session_id);
                }
            }
        });
    }
}

impl BackpressureGate {
    pub fn new(max_concurrency: usize, queue_limit: usize, per_session_inflight_limit: usize) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(max_concurrency.max(1))),
            queue_limit,
            per_session_inflight_limit: per_session_inflight_limit.max(1),
            queued: Arc::new(AtomicUsize::new(0)),
            in_flight_by_session: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn queue_depth(&self) -> usize {
        self.queued.load(Ordering::SeqCst)
    }

    pub async fn acquire(
        &self,
        session_id: &str,
        queue_wait_timeout_ms: u64,
    ) -> Result<BackpressureLease, RuntimeError> {
        let queued_now = self.queued.fetch_add(1, Ordering::SeqCst) + 1;
        if queued_now > self.queue_limit {
            self.queued.fetch_sub(1, Ordering::SeqCst);
            return Err(RuntimeError::Overloaded {
                reason: "queue_full",
                retry_after_ms: 100,
                queue_depth: queued_now,
            });
        }

        {
            let mut map = self.in_flight_by_session.lock().await;
            let current = map.get(session_id).copied().unwrap_or(0);
            if current >= self.per_session_inflight_limit {
                self.queued.fetch_sub(1, Ordering::SeqCst);
                return Err(RuntimeError::Overloaded {
                    reason: "session_limit_exceeded",
                    retry_after_ms: 100,
                    queue_depth: queued_now,
                });
            }
            map.insert(session_id.to_string(), current + 1);
        }

        let acquire_fut = Arc::clone(&self.semaphore).acquire_owned();
        let permit = match tokio::time::timeout(
            Duration::from_millis(queue_wait_timeout_ms.max(1)),
            acquire_fut,
        )
        .await
        {
            Ok(Ok(p)) => p,
            Ok(Err(_)) => {
                self.rollback_session(session_id).await;
                return Err(RuntimeError::Internal {
                    message: "runtime semaphore closed".to_string(),
                });
            }
            Err(_) => {
                self.rollback_session(session_id).await;
                return Err(RuntimeError::Overloaded {
                    reason: "concurrency_exhausted",
                    retry_after_ms: queue_wait_timeout_ms.max(1),
                    queue_depth: queued_now,
                });
            }
        };

        Ok(BackpressureLease {
            _permit: permit,
            session_id: session_id.to_string(),
            queued: Arc::clone(&self.queued),
            in_flight_by_session: Arc::clone(&self.in_flight_by_session),
        })
    }

    async fn rollback_session(&self, session_id: &str) {
        self.queued.fetch_sub(1, Ordering::SeqCst);
        let mut map = self.in_flight_by_session.lock().await;
        if let Some(count) = map.get_mut(session_id) {
            *count = count.saturating_sub(1);
            if *count == 0 {
                map.remove(session_id);
            }
        }
    }
}
