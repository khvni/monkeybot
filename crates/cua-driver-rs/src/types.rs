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
    /// Drag destination coordinates.
    pub end_x: Option<f64>,
    pub end_y: Option<f64>,
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

// ---------------------------------------------------------------------------
// Set-of-Mark (SOM) metadata for visual grounding
// ---------------------------------------------------------------------------

/// A single UI element detected in a screenshot, used for visual grounding.
/// The orchestrator uses these marks to map high-level actions (e.g. "click
/// the Submit button") to pixel coordinates.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SomElement {
    /// Unique numeric ID for this element within the screenshot.
    pub id: u32,
    /// Bounding box in screen coordinates: [x, y, width, height].
    pub bbox: [u32; 4],
    /// Human-readable label (e.g. "Submit", "File menu", "Search field").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// Element role/type from the accessibility tree (e.g. "button", "textfield").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    /// Center point for click targeting: [x, y].
    pub center: [u32; 2],
    /// Whether the element is currently focused.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focused: Option<bool>,
}

/// Full screenshot response with optional SOM annotations.
#[derive(Debug, Clone, Serialize)]
pub struct ScreenshotResponse {
    pub image: String,
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub size_bytes: usize,
    /// Set-of-Mark elements detected in the screenshot.
    /// Empty when SOM detection is unavailable or disabled.
    pub som_elements: Vec<SomElement>,
    /// Source of SOM data (e.g. "accessibility_tree", "none").
    pub som_source: String,
}

/// Payload for the `screenshot` message type (optional parameters).
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ScreenshotPayload {
    /// Whether to include SOM metadata in the response.
    #[serde(default = "default_true")]
    pub include_som: bool,
    /// Specific window ID to capture (None = full screen).
    #[serde(default)]
    pub window_id: Option<u64>,
}

fn default_true() -> bool {
    true
}
