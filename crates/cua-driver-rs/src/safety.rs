use crate::types::CuaAction;
use std::collections::HashSet;

/// Server-side safety layer that validates actions before execution.
pub struct SafetyGuard {
    allowed_apps: HashSet<String>,
    kill_switch: bool,
}

impl SafetyGuard {
    pub fn new() -> Self {
        Self {
            allowed_apps: HashSet::new(),
            kill_switch: false,
        }
    }

    /// Add an application to the allowlist.
    pub fn allow_app(&mut self, app_id: &str) {
        self.allowed_apps.insert(app_id.to_string());
    }

    /// Check if an action is safe to execute.
    pub fn validate(&self, action: &CuaAction) -> Result<(), String> {
        if self.kill_switch {
            return Err("Kill switch is active — all actions blocked".into());
        }

        // TODO: Validate that the target application is in the allowlist.
        // TODO: Check if the action pattern is destructive and requires confirmation.

        tracing::debug!(action_type = %action.action_type, "Action validated (stub)");
        Ok(())
    }

    /// Activate the kill switch.
    pub fn activate_kill_switch(&mut self) {
        self.kill_switch = true;
        tracing::warn!("Kill switch activated on driver side");
    }

    /// Deactivate the kill switch.
    pub fn deactivate_kill_switch(&mut self) {
        self.kill_switch = false;
        tracing::info!("Kill switch deactivated");
    }

    pub fn is_killed(&self) -> bool {
        self.kill_switch
    }
}

impl Default for SafetyGuard {
    fn default() -> Self {
        Self::new()
    }
}
