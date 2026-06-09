use serde::{Deserialize, Serialize};

/// Message received from the TypeScript orchestrator over Unix socket.
/// Protocol: newline-delimited JSON (NDJSON).
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
    Reset,
    Status,
    SetAllowlist,
    GetAllowlist,
    ConfirmAction,
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
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CuaAction {
    #[serde(rename = "type")]
    pub action_type: ActionType,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub text: Option<String>,
    pub key: Option<String>,
    pub button: Option<MouseButton>,
    pub direction: Option<ScrollDirection>,
    pub amount: Option<i32>,
    pub duration: Option<u64>,
    /// Target application identifier for allowlist enforcement.
    pub target_app: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionType {
    Click,
    DoubleClick,
    RightClick,
    MouseMove,
    MouseDrag,
    Scroll,
    TypeText,
    KeyPress,
    KeyDown,
    KeyUp,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ScrollDirection {
    Up,
    Down,
    Left,
    Right,
}

/// Payload for the `confirm_action` message type.
#[derive(Debug, Deserialize)]
pub struct ConfirmationPayload {
    pub confirmation_id: String,
    pub approved: bool,
}

/// Payload for the `set_allowlist` message type.
#[derive(Debug, Deserialize)]
pub struct AllowlistPayload {
    pub apps: Vec<String>,
}

/// Confirmation request returned when a destructive action is detected.
#[derive(Debug, Serialize)]
pub struct ConfirmationRequest {
    pub confirmation_required: bool,
    pub confirmation_id: String,
    pub action: String,
    pub description: String,
    pub risk_level: String,
}
