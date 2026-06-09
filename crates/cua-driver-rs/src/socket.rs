use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixListener;
use tokio::sync::Mutex;

use crate::cua::CuaExecutor;
use crate::safety::{detect_active_app, SafetyGuard};
use crate::types::{
    AllowlistPayload, ConfirmationPayload, CuaAction, DriverMessage, DriverResponse, MessageType,
};

const DEFAULT_SOCKET_PATH: &str = "/tmp/monkeybot-cua-driver.sock";

/// Unix socket server that listens for NDJSON commands from the TypeScript
/// orchestration layer and dispatches them to the CUA executor / safety guard.
pub struct SocketServer {
    socket_path: String,
    executor: Arc<Mutex<CuaExecutor>>,
    safety: Arc<Mutex<SafetyGuard>>,
    /// Actions waiting for user confirmation, keyed by `confirmation_id`.
    /// Stored here (rather than inside `SafetyGuard`) so the socket handler
    /// can look them up across connections.
    pending_confirmations: Arc<Mutex<HashMap<String, CuaAction>>>,
}

impl SocketServer {
    pub fn new(socket_path: Option<&str>) -> Self {
        let kill_switch = Arc::new(AtomicBool::new(false));

        Self {
            socket_path: socket_path.unwrap_or(DEFAULT_SOCKET_PATH).to_string(),
            executor: Arc::new(Mutex::new(CuaExecutor::new(Arc::clone(&kill_switch)))),
            safety: Arc::new(Mutex::new(SafetyGuard::new(Arc::clone(&kill_switch)))),
            pending_confirmations: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start the Unix socket server and listen for incoming connections.
    pub async fn run(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Remove stale socket file if it exists.
        let _ = std::fs::remove_file(&self.socket_path);

        let listener = UnixListener::bind(&self.socket_path)?;
        tracing::info!(path = %self.socket_path, "CUA driver listening");

        // Initialize the CUA executor.
        self.executor.lock().await.init().await.map_err(|e| {
            tracing::error!("Failed to initialize CUA executor: {e}");
            e
        })?;

        loop {
            let (stream, _) = listener.accept().await?;
            tracing::info!("Client connected");

            let executor = Arc::clone(&self.executor);
            let safety = Arc::clone(&self.safety);
            let pending = Arc::clone(&self.pending_confirmations);

            tokio::spawn(async move {
                let (reader, mut writer) = stream.into_split();
                let mut reader = BufReader::new(reader);
                let mut line = String::new();

                loop {
                    line.clear();
                    match reader.read_line(&mut line).await {
                        Ok(0) => {
                            tracing::info!("Client disconnected");
                            break;
                        }
                        Ok(_) => {
                            let response =
                                handle_message(&line, &executor, &safety, &pending).await;
                            let mut out = serde_json::to_string(&response).unwrap_or_default();
                            out.push('\n');
                            if writer.write_all(out.as_bytes()).await.is_err() {
                                break;
                            }
                        }
                        Err(e) => {
                            tracing::error!("Read error: {e}");
                            break;
                        }
                    }
                }
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Message dispatch
// ---------------------------------------------------------------------------

async fn handle_message(
    raw: &str,
    executor: &Arc<Mutex<CuaExecutor>>,
    safety: &Arc<Mutex<SafetyGuard>>,
    pending: &Arc<Mutex<HashMap<String, CuaAction>>>,
) -> DriverResponse {
    let msg: DriverMessage = match serde_json::from_str(raw.trim()) {
        Ok(m) => m,
        Err(e) => {
            return DriverResponse {
                id: String::new(),
                success: false,
                data: None,
                error: Some(format!("Invalid message: {e}")),
            };
        }
    };

    match msg.msg_type {
        // ---------------------------------------------------------------
        // Execute action (with safety validation + confirmation gating)
        // ---------------------------------------------------------------
        MessageType::ExecuteAction => handle_execute(msg, executor, safety, pending).await,

        // ---------------------------------------------------------------
        // Screenshot
        // ---------------------------------------------------------------
        MessageType::Screenshot => match executor.lock().await.screenshot().await {
            Ok(data) => DriverResponse {
                id: msg.id,
                success: true,
                data: Some(data),
                error: None,
            },
            Err(e) => DriverResponse {
                id: msg.id,
                success: false,
                data: None,
                error: Some(e),
            },
        },

        // ---------------------------------------------------------------
        // Kill switch — immediately halt everything
        // ---------------------------------------------------------------
        MessageType::Kill => {
            executor.lock().await.kill();
            safety.lock().await.activate_kill_switch();
            DriverResponse {
                id: msg.id,
                success: true,
                data: Some(serde_json::json!({ "killed": true })),
                error: None,
            }
        }

        // ---------------------------------------------------------------
        // Reset — re-activate after a kill
        // ---------------------------------------------------------------
        MessageType::Reset => {
            safety.lock().await.deactivate_kill_switch();
            match executor.lock().await.reset().await {
                Ok(()) => DriverResponse {
                    id: msg.id,
                    success: true,
                    data: Some(serde_json::json!({ "reset": true })),
                    error: None,
                },
                Err(e) => DriverResponse {
                    id: msg.id,
                    success: false,
                    data: None,
                    error: Some(e),
                },
            }
        }

        // ---------------------------------------------------------------
        // Status
        // ---------------------------------------------------------------
        MessageType::Status => {
            let active = executor.lock().await.is_active();
            let killed = safety.lock().await.is_killed();
            let allowlist = safety.lock().await.get_allowlist();
            let pending_count = pending.lock().await.len();
            DriverResponse {
                id: msg.id,
                success: true,
                data: Some(serde_json::json!({
                    "cua_active": active,
                    "kill_switch": killed,
                    "allowed_apps": allowlist,
                    "pending_confirmations": pending_count,
                })),
                error: None,
            }
        }

        // ---------------------------------------------------------------
        // Allowlist management
        // ---------------------------------------------------------------
        MessageType::SetAllowlist => {
            let payload: AllowlistPayload = match msg
                .payload
                .as_ref()
                .and_then(|p| serde_json::from_value(p.clone()).ok())
            {
                Some(p) => p,
                None => {
                    return DriverResponse {
                        id: msg.id,
                        success: false,
                        data: None,
                        error: Some("Missing or invalid allowlist payload".into()),
                    };
                }
            };
            safety.lock().await.set_allowlist(payload.apps);
            DriverResponse {
                id: msg.id,
                success: true,
                data: Some(serde_json::json!({ "allowlist_updated": true })),
                error: None,
            }
        }

        MessageType::GetAllowlist => {
            let list = safety.lock().await.get_allowlist();
            DriverResponse {
                id: msg.id,
                success: true,
                data: Some(serde_json::json!({ "apps": list })),
                error: None,
            }
        }

        // ---------------------------------------------------------------
        // Confirmation response
        // ---------------------------------------------------------------
        MessageType::ConfirmAction => {
            handle_confirm(msg, executor, safety, pending).await
        }
    }
}

// ---------------------------------------------------------------------------
// Execute action handler
// ---------------------------------------------------------------------------

async fn handle_execute(
    msg: DriverMessage,
    executor: &Arc<Mutex<CuaExecutor>>,
    safety: &Arc<Mutex<SafetyGuard>>,
    pending: &Arc<Mutex<HashMap<String, CuaAction>>>,
) -> DriverResponse {
    let action: CuaAction = match msg
        .payload
        .as_ref()
        .and_then(|p| serde_json::from_value(p.clone()).ok())
    {
        Some(a) => a,
        None => {
            return DriverResponse {
                id: msg.id,
                success: false,
                data: None,
                error: Some("Missing or invalid action payload".into()),
            };
        }
    };

    // Detect the active application *before* locking the safety mutex so
    // the blocking subprocess call doesn't hold the async lock.
    let active_app: Option<String> = tokio::task::spawn_blocking(detect_active_app)
        .await
        .unwrap_or(None);

    // Run safety validation (kill switch + allowlist + destructive check).
    match safety.lock().await.validate(&action, active_app.as_deref()) {
        Ok(None) => {
            // Safe — execute immediately.
            match executor.lock().await.execute(&action).await {
                Ok(data) => DriverResponse {
                    id: msg.id,
                    success: true,
                    data: Some(data),
                    error: None,
                },
                Err(e) => DriverResponse {
                    id: msg.id,
                    success: false,
                    data: None,
                    error: Some(e),
                },
            }
        }
        Ok(Some(confirmation)) => {
            // Destructive — park the action and ask the orchestrator for
            // confirmation.
            pending
                .lock()
                .await
                .insert(confirmation.confirmation_id.clone(), action);

            DriverResponse {
                id: msg.id,
                success: false,
                data: Some(serde_json::to_value(&confirmation).unwrap()),
                error: None,
            }
        }
        Err(reason) => DriverResponse {
            id: msg.id,
            success: false,
            data: None,
            error: Some(reason),
        },
    }
}

// ---------------------------------------------------------------------------
// Confirmation handler
// ---------------------------------------------------------------------------

async fn handle_confirm(
    msg: DriverMessage,
    executor: &Arc<Mutex<CuaExecutor>>,
    _safety: &Arc<Mutex<SafetyGuard>>,
    pending: &Arc<Mutex<HashMap<String, CuaAction>>>,
) -> DriverResponse {
    let payload: ConfirmationPayload = match msg
        .payload
        .as_ref()
        .and_then(|p| serde_json::from_value(p.clone()).ok())
    {
        Some(p) => p,
        None => {
            return DriverResponse {
                id: msg.id,
                success: false,
                data: None,
                error: Some("Missing or invalid confirmation payload".into()),
            };
        }
    };

    let action = pending.lock().await.remove(&payload.confirmation_id);

    match action {
        None => DriverResponse {
            id: msg.id,
            success: false,
            data: None,
            error: Some(format!(
                "Unknown confirmation_id: {}",
                payload.confirmation_id
            )),
        },
        Some(action) if payload.approved => {
            tracing::info!(
                id = %payload.confirmation_id,
                "Destructive action approved — executing"
            );
            match executor.lock().await.execute(&action).await {
                Ok(data) => DriverResponse {
                    id: msg.id,
                    success: true,
                    data: Some(data),
                    error: None,
                },
                Err(e) => DriverResponse {
                    id: msg.id,
                    success: false,
                    data: None,
                    error: Some(e),
                },
            }
        }
        Some(_) => {
            tracing::info!(
                id = %payload.confirmation_id,
                "Destructive action denied by user"
            );
            DriverResponse {
                id: msg.id,
                success: true,
                data: Some(serde_json::json!({ "denied": true })),
                error: None,
            }
        }
    }
}
