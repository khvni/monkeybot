use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixListener;
use tokio::sync::Mutex;

use crate::cua::CuaExecutor;
use crate::safety::SafetyGuard;
use crate::types::{CuaAction, DriverMessage, DriverResponse, MessageType};

const DEFAULT_SOCKET_PATH: &str = "/tmp/monkeybot-cua-driver.sock";

/// Unix socket server that listens for commands from the TypeScript orchestrator.
pub struct SocketServer {
    socket_path: String,
    executor: Arc<Mutex<CuaExecutor>>,
    safety: Arc<Mutex<SafetyGuard>>,
}

impl SocketServer {
    pub fn new(socket_path: Option<&str>) -> Self {
        Self {
            socket_path: socket_path.unwrap_or(DEFAULT_SOCKET_PATH).to_string(),
            executor: Arc::new(Mutex::new(CuaExecutor::new())),
            safety: Arc::new(Mutex::new(SafetyGuard::new())),
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
                            let response = handle_message(&line, &executor, &safety).await;
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

async fn handle_message(
    raw: &str,
    executor: &Arc<Mutex<CuaExecutor>>,
    safety: &Arc<Mutex<SafetyGuard>>,
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
        MessageType::ExecuteAction => {
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

            // Safety check.
            if let Err(e) = safety.lock().await.validate(&action) {
                return DriverResponse {
                    id: msg.id,
                    success: false,
                    data: None,
                    error: Some(e),
                };
            }

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
        MessageType::Screenshot => match executor.lock().await.screenshot().await {
            Ok(bytes) => DriverResponse {
                id: msg.id,
                success: true,
                data: Some(serde_json::json!({ "size": bytes.len() })),
                error: None,
            },
            Err(e) => DriverResponse {
                id: msg.id,
                success: false,
                data: None,
                error: Some(e),
            },
        },
        MessageType::Kill => {
            executor.lock().await.kill();
            safety.lock().await.activate_kill_switch();
            DriverResponse {
                id: msg.id,
                success: true,
                data: None,
                error: None,
            }
        }
        MessageType::Status => {
            let active = executor.lock().await.is_active();
            let killed = safety.lock().await.is_killed();
            DriverResponse {
                id: msg.id,
                success: true,
                data: Some(serde_json::json!({
                    "cua_active": active,
                    "kill_switch": killed,
                })),
                error: None,
            }
        }
    }
}
