/**
 * Kill switch button — a prominent button to immediately stop the agent.
 */
export function createKillSwitch(onKill: () => void): HTMLElement {
  const container = document.createElement("div");
  container.className = "kill-switch-container";

  const btn = document.createElement("button");
  btn.className = "kill-switch-btn";
  btn.innerHTML = `<span class="kill-icon">⛔</span> STOP AGENT`;

  let confirming = false;
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;

  btn.addEventListener("click", () => {
    if (!confirming) {
      // First click — ask for confirmation
      confirming = true;
      btn.classList.add("confirming");
      btn.innerHTML = `<span class="kill-icon">⚠️</span> CONFIRM STOP`;

      confirmTimer = setTimeout(() => {
        confirming = false;
        btn.classList.remove("confirming");
        btn.innerHTML = `<span class="kill-icon">⛔</span> STOP AGENT`;
      }, 3000);
    } else {
      // Second click — execute kill
      if (confirmTimer) clearTimeout(confirmTimer);
      confirming = false;
      btn.classList.remove("confirming");
      btn.classList.add("activated");
      btn.innerHTML = `<span class="kill-icon">⛔</span> AGENT STOPPED`;
      btn.disabled = true;

      onKill();

      // Reset after 5 seconds
      setTimeout(() => {
        btn.disabled = false;
        btn.classList.remove("activated");
        btn.innerHTML = `<span class="kill-icon">⛔</span> STOP AGENT`;
      }, 5000);
    }
  });

  container.appendChild(btn);
  return container;
}
