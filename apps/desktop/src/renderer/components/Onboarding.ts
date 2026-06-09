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
    <div class="onboarding-header">
      <div class="onboarding-icon">🐵</div>
      <h2>Welcome to Monkeybot</h2>
      <p class="onboarding-subtitle">
        Enter your API keys to get started. These are stored locally on your machine.
      </p>
    </div>

    <div class="onboarding-fields">
      <div class="field-group">
        <label for="key-openrouter">
          OpenRouter API Key <span class="required">*</span>
        </label>
        <input id="key-openrouter" type="password" placeholder="sk-or-..." autocomplete="off" spellcheck="false" />
        <span class="field-hint">Required — for model routing (Gemini Flash, Claude, GPT-4o)</span>
      </div>

      <div class="field-group">
        <label for="key-assemblyai">AssemblyAI API Key</label>
        <input id="key-assemblyai" type="password" placeholder="..." autocomplete="off" spellcheck="false" />
        <span class="field-hint">Optional — for push-to-talk voice input</span>
      </div>

      <div class="field-group">
        <label for="key-elevenlabs">ElevenLabs API Key</label>
        <input id="key-elevenlabs" type="password" placeholder="..." autocomplete="off" spellcheck="false" />
        <span class="field-hint">Optional — for text-to-speech responses</span>
      </div>
    </div>

    <button id="btn-save-keys" class="btn-primary">Save & Continue</button>
    <p id="onboarding-error" class="error-text" style="display:none;"></p>
  `;

  root.appendChild(container);

  const btn = container.querySelector("#btn-save-keys") as HTMLButtonElement;
  const errorEl = container.querySelector("#onboarding-error") as HTMLElement;

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

    errorEl.style.display = "none";

    if (!openRouter) {
      errorEl.textContent = "OpenRouter API key is required.";
      errorEl.style.display = "block";
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
      errorEl.textContent = "Failed to save keys. Please try again.";
      errorEl.style.display = "block";
    }
  });

  // Allow Enter key to submit
  container.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      btn.click();
    }
  });
}
