/**
 * Onboarding flow — prompts the user to enter API keys for
 * OpenRouter, AssemblyAI, and ElevenLabs.
 */
export function renderOnboarding(
  root: HTMLElement,
  onComplete: () => void
): void {
  const container = document.createElement("div");
  container.className = "onboarding";

  container.innerHTML = `
    <h2>Welcome to Monkeybot</h2>
    <p style="color: var(--text-secondary); font-size: 13px;">
      Enter your API keys to get started. These are stored locally on your machine.
    </p>

    <label>OpenRouter API Key</label>
    <input id="key-openrouter" type="password" placeholder="sk-or-..." />

    <label>AssemblyAI API Key</label>
    <input id="key-assemblyai" type="password" placeholder="..." />

    <label>ElevenLabs API Key</label>
    <input id="key-elevenlabs" type="password" placeholder="..." />

    <button id="btn-save-keys">Save & Continue</button>
  `;

  root.appendChild(container);

  const btn = container.querySelector("#btn-save-keys") as HTMLButtonElement;
  btn.addEventListener("click", async () => {
    const openRouter = (
      container.querySelector("#key-openrouter") as HTMLInputElement
    ).value.trim();
    const assemblyAi = (
      container.querySelector("#key-assemblyai") as HTMLInputElement
    ).value.trim();
    const elevenLabs = (
      container.querySelector("#key-elevenlabs") as HTMLInputElement
    ).value.trim();

    if (!openRouter) {
      alert("OpenRouter API key is required.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Saving...";

    const result = await window.monkeybot.saveApiKeys({
      openRouter,
      assemblyAi,
      elevenLabs,
    });

    if (result.success) {
      onComplete();
    } else {
      btn.disabled = false;
      btn.textContent = "Save & Continue";
      alert("Failed to save keys. Please try again.");
    }
  });
}
