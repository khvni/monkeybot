use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use base64::Engine;
use enigo::{Axis, Button, Coordinate, Direction, Enigo, Keyboard, Mouse, Settings};

use crate::types::{ActionType, CuaAction, MouseButton, ScrollDirection};

/// CUA (Computer Use Agent) execution layer.
///
/// Provides input simulation via `enigo` and screen capture via
/// platform-native tools (`scrot`/`import` on Linux, `screencapture` on macOS).
///
/// All operations run inside `spawn_blocking` to avoid blocking the
/// async runtime.
pub struct CuaExecutor {
    active: bool,
    kill_switch: Arc<AtomicBool>,
}

impl CuaExecutor {
    pub fn new(kill_switch: Arc<AtomicBool>) -> Self {
        Self {
            active: false,
            kill_switch,
        }
    }

    /// Initialize the CUA backend. Verifies that a display is reachable.
    pub async fn init(&mut self) -> Result<(), String> {
        let result = tokio::task::spawn_blocking(|| -> Result<(), String> {
            let _enigo =
                Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;
            Ok(())
        })
        .await
        .map_err(|e| format!("spawn_blocking join error: {e}"))?;

        result?;

        self.active = true;
        tracing::info!("CUA executor initialized");
        Ok(())
    }

    /// Execute a computer-use action.
    pub async fn execute(&self, action: &CuaAction) -> Result<serde_json::Value, String> {
        if !self.active {
            return Err("CUA executor not initialized".into());
        }
        if self.kill_switch.load(Ordering::SeqCst) {
            return Err("Kill switch is active — action blocked".into());
        }

        let action = action.clone();
        let ks = Arc::clone(&self.kill_switch);

        tokio::task::spawn_blocking(move || execute_sync(&action, &ks))
            .await
            .map_err(|e| format!("Task join error: {e}"))?
    }

    /// Capture a screenshot of the primary monitor.
    /// Returns a JSON value with base64-encoded PNG, dimensions, and size.
    pub async fn screenshot(&self) -> Result<serde_json::Value, String> {
        if !self.active {
            return Err("CUA executor not initialized".into());
        }

        tokio::task::spawn_blocking(screenshot_sync)
            .await
            .map_err(|e| format!("Task join error: {e}"))?
    }

    /// Emergency stop — halt all ongoing actions.
    pub fn kill(&mut self) {
        self.active = false;
        self.kill_switch.store(true, Ordering::SeqCst);
        tracing::warn!("CUA executor killed — all actions halted");
    }

    /// Re-activate after a kill.
    pub async fn reset(&mut self) -> Result<(), String> {
        self.kill_switch.store(false, Ordering::SeqCst);
        self.init().await
    }

    pub fn is_active(&self) -> bool {
        self.active
    }
}

// ---------------------------------------------------------------------------
// Synchronous helpers (run inside `spawn_blocking`)
// ---------------------------------------------------------------------------

fn execute_sync(
    action: &CuaAction,
    kill_switch: &AtomicBool,
) -> Result<serde_json::Value, String> {
    if kill_switch.load(Ordering::SeqCst) {
        return Err("Kill switch activated mid-execution".into());
    }

    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {e}"))?;

    match action.action_type {
        ActionType::Click => {
            let (x, y) = required_coords(action)?;
            let btn = map_button(action.button.as_ref());
            enigo
                .move_mouse(x, y, Coordinate::Abs)
                .map_err(|e| format!("mouse_move: {e}"))?;
            std::thread::sleep(std::time::Duration::from_millis(10));
            enigo
                .button(btn, Direction::Click)
                .map_err(|e| format!("mouse_click: {e}"))?;
            ok_action("click")
        }
        ActionType::DoubleClick => {
            let (x, y) = required_coords(action)?;
            enigo
                .move_mouse(x, y, Coordinate::Abs)
                .map_err(|e| format!("mouse_move: {e}"))?;
            std::thread::sleep(std::time::Duration::from_millis(10));
            enigo
                .button(Button::Left, Direction::Click)
                .map_err(|e| format!("mouse_click: {e}"))?;
            std::thread::sleep(std::time::Duration::from_millis(50));
            enigo
                .button(Button::Left, Direction::Click)
                .map_err(|e| format!("mouse_click: {e}"))?;
            ok_action("double_click")
        }
        ActionType::RightClick => {
            let (x, y) = required_coords(action)?;
            enigo
                .move_mouse(x, y, Coordinate::Abs)
                .map_err(|e| format!("mouse_move: {e}"))?;
            std::thread::sleep(std::time::Duration::from_millis(10));
            enigo
                .button(Button::Right, Direction::Click)
                .map_err(|e| format!("mouse_click: {e}"))?;
            ok_action("right_click")
        }
        ActionType::MouseMove => {
            let (x, y) = required_coords(action)?;
            enigo
                .move_mouse(x, y, Coordinate::Abs)
                .map_err(|e| format!("mouse_move: {e}"))?;
            ok_action("mouse_move")
        }
        ActionType::MouseDrag => {
            let (start_x, start_y) = required_coords(action)?;
            let (end_x, end_y) = match (action.end_x, action.end_y) {
                (Some(ex), Some(ey)) => (ex as i32, ey as i32),
                _ => return Err("MouseDrag requires `end_x` and `end_y` coordinates".into()),
            };
            let btn = map_button(action.button.as_ref());
            enigo
                .move_mouse(start_x, start_y, Coordinate::Abs)
                .map_err(|e| format!("mouse_move to start: {e}"))?;
            std::thread::sleep(std::time::Duration::from_millis(10));
            enigo
                .button(btn, Direction::Press)
                .map_err(|e| format!("mouse_down: {e}"))?;
            std::thread::sleep(std::time::Duration::from_millis(10));
            let steps = action.duration.unwrap_or(10) as i32;
            let steps = steps.max(1);
            for i in 1..=steps {
                let ix = start_x + (end_x - start_x) * i / steps;
                let iy = start_y + (end_y - start_y) * i / steps;
                enigo
                    .move_mouse(ix, iy, Coordinate::Abs)
                    .map_err(|e| format!("mouse_move during drag: {e}"))?;
                std::thread::sleep(std::time::Duration::from_millis(2));
            }
            enigo
                .button(btn, Direction::Release)
                .map_err(|e| format!("mouse_up: {e}"))?;
            ok_action("mouse_drag")
        }
        ActionType::Scroll => {
            let amount = action.amount.unwrap_or(3);
            match action.direction.as_ref().unwrap_or(&ScrollDirection::Down) {
                ScrollDirection::Up => enigo
                    .scroll(-amount, Axis::Vertical)
                    .map_err(|e| format!("scroll: {e}"))?,
                ScrollDirection::Down => enigo
                    .scroll(amount, Axis::Vertical)
                    .map_err(|e| format!("scroll: {e}"))?,
                ScrollDirection::Left => enigo
                    .scroll(-amount, Axis::Horizontal)
                    .map_err(|e| format!("scroll: {e}"))?,
                ScrollDirection::Right => enigo
                    .scroll(amount, Axis::Horizontal)
                    .map_err(|e| format!("scroll: {e}"))?,
            }
            ok_action("scroll")
        }
        ActionType::TypeText => {
            let text = action
                .text
                .as_deref()
                .ok_or("TypeText requires `text` field")?;
            enigo
                .text(text)
                .map_err(|e| format!("type_text: {e}"))?;
            ok_action("type_text")
        }
        ActionType::KeyPress => {
            let key = action
                .key
                .as_deref()
                .ok_or("KeyPress requires `key` field")?;
            let enigo_key = parse_key(key)?;
            enigo
                .key(enigo_key, Direction::Click)
                .map_err(|e| format!("key_press: {e}"))?;
            ok_action("key_press")
        }
        ActionType::KeyDown => {
            let key = action
                .key
                .as_deref()
                .ok_or("KeyDown requires `key` field")?;
            let enigo_key = parse_key(key)?;
            enigo
                .key(enigo_key, Direction::Press)
                .map_err(|e| format!("key_down: {e}"))?;
            ok_action("key_down")
        }
        ActionType::KeyUp => {
            let key = action
                .key
                .as_deref()
                .ok_or("KeyUp requires `key` field")?;
            let enigo_key = parse_key(key)?;
            enigo
                .key(enigo_key, Direction::Release)
                .map_err(|e| format!("key_up: {e}"))?;
            ok_action("key_up")
        }
    }
}

// ---------------------------------------------------------------------------
// Screenshot capture (platform-native tools)
// ---------------------------------------------------------------------------

fn screenshot_sync() -> Result<serde_json::Value, String> {
    let png_bytes = capture_screen_png()?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
    let size = png_bytes.len();
    let (width, height) = parse_png_dimensions(&png_bytes).unwrap_or((0, 0));

    Ok(serde_json::json!({
        "image": b64,
        "width": width,
        "height": height,
        "format": "png",
        "size_bytes": size,
    }))
}

#[cfg(target_os = "linux")]
fn capture_screen_png() -> Result<Vec<u8>, String> {
    // Try `scrot` (stdout mode).
    if let Ok(output) = std::process::Command::new("scrot")
        .args(["-o", "/dev/stdout"])
        .output()
    {
        if output.status.success() && !output.stdout.is_empty() {
            return Ok(output.stdout);
        }
    }

    // ImageMagick `import`.
    if let Ok(output) = std::process::Command::new("import")
        .args(["-window", "root", "png:-"])
        .output()
    {
        if output.status.success() && !output.stdout.is_empty() {
            return Ok(output.stdout);
        }
    }

    // File-based fallback with `scrot`.
    let tmp = format!("/tmp/monkeybot-screenshot-{}.png", uuid::Uuid::new_v4());
    if let Ok(output) = std::process::Command::new("scrot").arg(&tmp).output() {
        if output.status.success() {
            if let Ok(bytes) = std::fs::read(&tmp) {
                let _ = std::fs::remove_file(&tmp);
                return Ok(bytes);
            }
        }
    }

    Err("No screenshot tool available. Install `scrot` or ImageMagick.".into())
}

#[cfg(target_os = "macos")]
fn capture_screen_png() -> Result<Vec<u8>, String> {
    let tmp = format!("/tmp/monkeybot-screenshot-{}.png", uuid::Uuid::new_v4());
    let output = std::process::Command::new("screencapture")
        .args(["-x", "-m", "-t", "png", &tmp])
        .output()
        .map_err(|e| format!("screencapture failed: {e}"))?;

    if !output.status.success() {
        return Err("screencapture returned non-zero status".into());
    }

    let bytes =
        std::fs::read(&tmp).map_err(|e| format!("Failed to read screenshot file: {e}"))?;
    let _ = std::fs::remove_file(&tmp);
    Ok(bytes)
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn capture_screen_png() -> Result<Vec<u8>, String> {
    Err("Screenshot capture is not supported on this platform".into())
}

/// Extract width and height from a PNG IHDR chunk (bytes 16..24).
fn parse_png_dimensions(data: &[u8]) -> Option<(u32, u32)> {
    if data.len() < 24 {
        return None;
    }
    let width = u32::from_be_bytes([data[16], data[17], data[18], data[19]]);
    let height = u32::from_be_bytes([data[20], data[21], data[22], data[23]]);
    Some((width, height))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn required_coords(action: &CuaAction) -> Result<(i32, i32), String> {
    match (action.x, action.y) {
        (Some(x), Some(y)) => Ok((x as i32, y as i32)),
        _ => Err("Action requires `x` and `y` coordinates".into()),
    }
}

fn map_button(btn: Option<&MouseButton>) -> Button {
    match btn {
        Some(MouseButton::Right) => Button::Right,
        Some(MouseButton::Middle) => Button::Middle,
        _ => Button::Left,
    }
}

fn ok_action(name: &str) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "executed": true, "action_type": name }))
}

/// Map a human-readable key name to an `enigo::Key`.
fn parse_key(name: &str) -> Result<enigo::Key, String> {
    use enigo::Key;
    match name.to_lowercase().as_str() {
        "return" | "enter" => Ok(Key::Return),
        "tab" => Ok(Key::Tab),
        "escape" | "esc" => Ok(Key::Escape),
        "backspace" => Ok(Key::Backspace),
        "delete" => Ok(Key::Delete),
        "space" => Ok(Key::Space),
        "up" | "arrowup" => Ok(Key::UpArrow),
        "down" | "arrowdown" => Ok(Key::DownArrow),
        "left" | "arrowleft" => Ok(Key::LeftArrow),
        "right" | "arrowright" => Ok(Key::RightArrow),
        "home" => Ok(Key::Home),
        "end" => Ok(Key::End),
        "pageup" => Ok(Key::PageUp),
        "pagedown" => Ok(Key::PageDown),
        "shift" => Ok(Key::Shift),
        "control" | "ctrl" => Ok(Key::Control),
        "alt" => Ok(Key::Alt),
        "meta" | "super" | "command" | "cmd" => Ok(Key::Meta),
        "capslock" => Ok(Key::CapsLock),
        "f1" => Ok(Key::F1),
        "f2" => Ok(Key::F2),
        "f3" => Ok(Key::F3),
        "f4" => Ok(Key::F4),
        "f5" => Ok(Key::F5),
        "f6" => Ok(Key::F6),
        "f7" => Ok(Key::F7),
        "f8" => Ok(Key::F8),
        "f9" => Ok(Key::F9),
        "f10" => Ok(Key::F10),
        "f11" => Ok(Key::F11),
        "f12" => Ok(Key::F12),
        s if s.len() == 1 => {
            // Use the original character to preserve case (e.g. 'A' vs 'a').
            let ch = name.chars().next().unwrap();
            Ok(Key::Unicode(ch))
        }
        other => Err(format!("Unknown key: {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_known_keys() {
        assert!(matches!(parse_key("Return"), Ok(enigo::Key::Return)));
        assert!(matches!(parse_key("ENTER"), Ok(enigo::Key::Return)));
        assert!(matches!(parse_key("tab"), Ok(enigo::Key::Tab)));
        assert!(matches!(parse_key("F1"), Ok(enigo::Key::F1)));
        assert!(matches!(parse_key("a"), Ok(enigo::Key::Unicode('a'))));
        // Uppercase must be preserved.
        assert!(matches!(parse_key("A"), Ok(enigo::Key::Unicode('A'))));
    }

    #[test]
    fn parse_unknown_key_is_err() {
        assert!(parse_key("nonexistentkey").is_err());
    }

    #[test]
    fn png_dimensions_parsing() {
        let mut buf = vec![0u8; 24];
        // Width = 1920, Height = 1080
        buf[16..20].copy_from_slice(&1920u32.to_be_bytes());
        buf[20..24].copy_from_slice(&1080u32.to_be_bytes());
        assert_eq!(parse_png_dimensions(&buf), Some((1920, 1080)));
    }
}
