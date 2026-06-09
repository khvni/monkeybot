use serde::{Deserialize, Serialize};

/// Message received from the TypeScript orchestrator over Unix socket.
#[derive(Debug, Deserialize)]
pub struct DriverMessage {
    pub id: String,
    #[serde(rename = "type")]
    pub msg_type: MessageType,
    pub payload: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageType {
    ExecuteAction,
    Screenshot,
    Kill,
    Status,
}

/// Response sent back to the TypeScript orchestrator.
#[derive(Debug, Serialize)]
pub struct DriverResponse {
    pub id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// A computer-use action dispatched to the CUA backend.
#[derive(Debug, Deserialize)]
pub struct CuaAction {
    #[serde(rename = "type")]
    pub action_type: String,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub text: Option<String>,
    pub key: Option<String>,
    pub duration: Option<u64>,
}
