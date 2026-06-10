use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use regex::Regex;
use uuid::Uuid;

use crate::types::{ActionType, ConfirmationRequest, CuaAction};

/// Default patterns that identify destructive / high-risk actions.
const DEFAULT_DESTRUCTIVE_PATTERNS: &[&str] = &[
    r"(?i)delete",
    r"(?i)remove",
    r"(?i)send\s+message",
    r"(?i)send\s+email",
    r"(?i)submit",
    r"(?i)publish",
    r"(?i)drop\s+table",
    r"(?i)format\s+disk",
    r"(?i)empty\s+trash",
    r"(?i)uninstall",
    r"(?i)rm\s+-rf",
];

/// Server-side safety layer that validates actions before execution.
///
/// Enforces:
/// - Kill switch (shared `AtomicBool` — checked by the executor too).
/// - App allowlist (only interact with approved applications).
/// - Destructive-action detection with confirmation gating.
pub struct SafetyGuard {
    kill_switch: Arc<AtomicBool>,
    allowed_apps: HashSet<String>,
    /// When true, *only* allowlisted apps may be targeted.
    /// When false (or allowlist empty), any app is permitted.
    enforce_allowlist: bool,
    destructive_patterns: Vec<Regex>,
}

impl SafetyGuard {
    pub fn new(kill_switch: Arc<AtomicBool>) -> Self {
        let patterns = DEFAULT_DESTRUCTIVE_PATTERNS
            .iter()
            .filter_map(|p| Regex::new(p).ok())
            .collect();

        Self {
            kill_switch,
            allowed_apps: HashSet::new(),
            enforce_allowlist: false,
            destructive_patterns: patterns,
        }
    }

    // ------------------------------------------------------------------
    // Allowlist management
    // ------------------------------------------------------------------

    /// Replace the entire allowlist. An empty list disables enforcement.
    pub fn set_allowlist(&mut self, apps: Vec<String>) {
        self.enforce_allowlist = !apps.is_empty();
        self.allowed_apps = apps.into_iter().collect();
        tracing::info!(
            count = self.allowed_apps.len(),
            "App allowlist updated"
        );
    }

    pub fn get_allowlist(&self) -> Vec<String> {
        self.allowed_apps.iter().cloned().collect()
    }

    // ------------------------------------------------------------------
    // Kill switch
    // ------------------------------------------------------------------

    pub fn activate_kill_switch(&self) {
        self.kill_switch.store(true, Ordering::SeqCst);
        tracing::warn!("Kill switch activated on safety guard");
    }

    pub fn deactivate_kill_switch(&self) {
        self.kill_switch.store(false, Ordering::SeqCst);
        tracing::info!("Kill switch deactivated");
    }

    pub fn is_killed(&self) -> bool {
        self.kill_switch.load(Ordering::SeqCst)
    }

    // ------------------------------------------------------------------
    // Validation
    // ------------------------------------------------------------------

    /// Validate an action. Returns:
    ///
    /// - `Ok(None)` — action is safe, execute immediately.
    /// - `Ok(Some(request))` — action is destructive, confirmation required.
    /// - `Err(reason)` — action is blocked (kill switch, not in allowlist).
    ///
    /// `active_app` is the pre-detected active application name (detected
    /// outside the mutex guard to avoid blocking the async runtime).
    pub fn validate(
        &self,
        action: &CuaAction,
        active_app: Option<&str>,
    ) -> Result<Option<ConfirmationRequest>, String> {
        // 1. Kill switch
        if self.is_killed() {
            return Err("Kill switch is active — all actions blocked".into());
        }

        // 2. App allowlist
        if self.enforce_allowlist {
            if let Some(ref app) = action.target_app {
                if !self.allowed_apps.contains(app) {
                    return Err(format!(
                        "Application '{app}' is not in the allowlist"
                    ));
                }
            } else if let Some(active) = active_app {
                if !self.allowed_apps.contains(active) {
                    return Err(format!(
                        "Active application '{active}' is not in the allowlist"
                    ));
                }
            }
            // If no target_app and detection returned None, allow through (best-effort).
        }

        // 3. Destructive-action check
        if self.is_destructive(action) {
            let confirmation_id = Uuid::new_v4().to_string();
            let description = describe_action(action);
            let risk = risk_level(action);

            return Ok(Some(ConfirmationRequest {
                confirmation_required: true,
                confirmation_id,
                action: format!("{:?}", action.action_type),
                description,
                risk_level: risk.to_string(),
            }));
        }

        Ok(None)
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    fn is_destructive(&self, action: &CuaAction) -> bool {
        // Check text payload against destructive patterns.
        let haystack = action
            .text
            .as_deref()
            .or(action.key.as_deref())
            .unwrap_or("");

        if self.destructive_patterns.iter().any(|re| re.is_match(haystack)) {
            return true;
        }

        // Certain action types on certain keys are inherently risky.
        if let ActionType::KeyPress = action.action_type {
            if let Some(ref key) = action.key {
                let lower = key.to_lowercase();
                // Ctrl+Shift+Delete, etc.
                if lower.contains("delete") {
                    return true;
                }
            }
        }

        false
    }
}

// ---------------------------------------------------------------------------
// Platform helpers
// ---------------------------------------------------------------------------

/// Best-effort active-window detection.
///
/// Spawns `xdotool` (Linux) or `osascript` (macOS) as a subprocess.
/// Must be called **outside** any async mutex guard to avoid blocking
/// the tokio runtime.
pub fn detect_active_app() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdotool")
            .args(["getactivewindow", "getwindowname"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("osascript")
            .args([
                "-e",
                "tell application \"System Events\" to get name of first application process whose frontmost is true",
            ])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        None
    }
}

fn describe_action(action: &CuaAction) -> String {
    match action.action_type {
        ActionType::TypeText => {
            let preview = action
                .text
                .as_deref()
                .unwrap_or("")
                .chars()
                .take(80)
                .collect::<String>();
            format!("Type text: \"{preview}\"")
        }
        ActionType::KeyPress => format!(
            "Key press: {}",
            action.key.as_deref().unwrap_or("unknown")
        ),
        ActionType::Click => format!(
            "Click at ({}, {})",
            action.x.unwrap_or(0.0),
            action.y.unwrap_or(0.0)
        ),
        _ => format!("{:?} action", action.action_type),
    }
}

fn risk_level(action: &CuaAction) -> &'static str {
    let haystack = action
        .text
        .as_deref()
        .or(action.key.as_deref())
        .unwrap_or("")
        .to_lowercase();

    if haystack.contains("rm -rf") || haystack.contains("format disk") || haystack.contains("drop table") {
        "critical"
    } else if haystack.contains("delete") || haystack.contains("remove") || haystack.contains("uninstall") {
        "high"
    } else if haystack.contains("send") || haystack.contains("submit") || haystack.contains("publish") {
        "medium"
    } else {
        "low"
    }
}
