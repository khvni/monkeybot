/**
 * Onboarding flow — prompts the user to enter API keys for
 * OpenRouter, AssemblyAI, and ElevenLabs.
 *
 * Validates key format before submission, provides show/hide toggles,
 * and calls the `save-api-keys` IPC handler via the preload bridge.
 */

interface KeyFieldConfig {
  id: string;
  label: string;
  placeholder: string;
  hint: string;
  required: boolean;
  prefix?: string;
}

const KEY_FIELDS: KeyFieldConfig[] = [
  {
    id: "openrouter",
    label: "OpenRouter API Key",
    placeholder: "sk-or-v1-...",
    hint: "Required — for model routing (Gemini Flash, Claude, GPT-4o)",
    required: true,
    prefix: "sk-or-",
  },
  {
    id: "assemblyai",
    label: "AssemblyAI API Key",
    placeholder: "your AssemblyAI key",
    hint: "Optional — for push-to-talk voice input",
    required: false,
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs API Key",
    placeholder: "your ElevenLabs key",
    hint: "Optional — for text-to-speech responses",
    required: false,
  },
];

function createFieldGroup(config: KeyFieldConfig): HTMLElement {
  const group = document.createElement("div");
  group.className = "field-group";

  const labelRow = document.createElement("div");
  labelRow.className = "field-label-row";

  const label = document.createElement("label");
  label.setAttribute("for", `key-${config.id}`);
  label.innerHTML = config.required
    ? `${config.label} <span class="required">*</span>`
    : config.label;

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "toggle-visibility";
  toggleBtn.textContent = "Show";
  toggleBtn.setAttribute("aria-label", `Toggle ${config.label} visibility`);

  labelRow.appendChild(label);
  labelRow.appendChild(toggleBtn);

  const input = document.createElement("input");
  input.id = `key-${config.id}`;
  input.type = "password";
  input.placeholder = config.placeholder;
  input.autocomplete = "off";
  input.spellcheck = false;

  const hint = document.createElement("span");
  hint.className = "field-hint";
  hint.textContent = config.hint;

  const validationMsg = document.createElement("span");
  validationMsg.className = "field-validation";
  validationMsg.style.display = "none";

  toggleBtn.addEventListener("click", () => {
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    toggleBtn.textContent = isPassword ? "Hide" : "Show";
  });

  // Live validation for required fields with prefix
  if (config.required && config.prefix) {
    input.addEventListener("input", () => {
      const val = input.value.trim();
      if (val && !val.startsWith(config.prefix!)) {
        validationMsg.textContent = `Expected format: ${config.prefix}...`;
        validationMsg.className = "field-validation warning";
        validationMsg.style.display = "block";
      } else {
        validationMsg.style.display = "none";
      }
    });
  }

  group.appendChild(labelRow);
  group.appendChild(input);
  group.appendChild(hint);
  group.appendChild(validationMsg);

  return group;
}

export function renderOnboarding(
  root: HTMLElement,
  onComplete: () => void
): void {
  const container = document.createElement("div");
  container.className = "onboarding";

  // Header
  const header = document.createElement("div");
  header.className = "onboarding-header";
  header.innerHTML = `
    <div class="onboarding-icon">🐵</div>
    <h2>Welcome to Monkeybot</h2>
    <p class="onboarding-subtitle">
      Enter your API keys to get started.<br/>
      Keys are encrypted and stored locally on your machine.
    </p>
  `;

  // Fields
  const fieldsContainer = document.createElement("div");
  fieldsContainer.className = "onboarding-fields";

  for (const config of KEY_FIELDS) {
    fieldsContainer.appendChild(createFieldGroup(config));
  }

  // Submit button
  const btn = document.createElement("button");
  btn.id = "btn-save-keys";
  btn.className = "btn-primary";
  btn.textContent = "Save & Continue";

  // Error message
  const errorEl = document.createElement("p");
  errorEl.id = "onboarding-error";
  errorEl.className = "error-text";
  errorEl.style.display = "none";

  // Assemble
  container.appendChild(header);
  container.appendChild(fieldsContainer);
  container.appendChild(btn);
  container.appendChild(errorEl);
  root.appendChild(container);

  // Submit handler
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

    if (!openRouter.startsWith("sk-or-")) {
      errorEl.textContent =
        "OpenRouter key should start with \"sk-or-\". Double-check your key.";
      errorEl.style.display = "block";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Saving…";

    const result = await window.monkeybot.saveApiKeys({
      openRouter,
      assemblyAi,
      elevenLabs,
    });

    if (result.success) {
      btn.textContent = "Done!";
      // Brief delay so the user sees success state
      setTimeout(() => onComplete(), 300);
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

  // Focus the first input
  const firstInput = container.querySelector(
    "#key-openrouter"
  ) as HTMLInputElement;
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 50);
  }
}
