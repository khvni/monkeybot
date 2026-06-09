use crate::types::CuaAction;

/// CUA (Computer Use Agent) integration layer.
/// Stub — will integrate with trycua/cua for host-based execution.
pub struct CuaExecutor {
    active: bool,
}

impl CuaExecutor {
    pub fn new() -> Self {
        Self { active: false }
    }

    /// Initialize the CUA backend.
    pub async fn init(&mut self) -> Result<(), String> {
        // TODO: Initialize trycua/cua host-based execution environment.
        self.active = true;
        tracing::info!("CUA executor initialized (stub)");
        Ok(())
    }

    /// Execute a computer-use action.
    pub async fn execute(&self, action: &CuaAction) -> Result<serde_json::Value, String> {
        if !self.active {
            return Err("CUA executor not initialized".into());
        }

        // TODO: Dispatch action to trycua/cua runtime.
        tracing::info!(action_type = %action.action_type, "Executing CUA action (stub)");

        Ok(serde_json::json!({
            "executed": true,
            "action_type": action.action_type,
        }))
    }

    /// Capture a screenshot of the current screen.
    pub async fn screenshot(&self) -> Result<Vec<u8>, String> {
        if !self.active {
            return Err("CUA executor not initialized".into());
        }

        // TODO: Capture screen via platform API.
        tracing::info!("Taking screenshot (stub)");
        Ok(Vec::new())
    }

    /// Emergency stop — halt all ongoing actions.
    pub fn kill(&mut self) {
        self.active = false;
        tracing::warn!("CUA executor killed — all actions halted");
    }

    pub fn is_active(&self) -> bool {
        self.active
    }
}

impl Default for CuaExecutor {
    fn default() -> Self {
        Self::new()
    }
}
