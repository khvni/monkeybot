/**
 * Text input component for sending messages to the agent.
 */
export function createTextInput(
  onSend: (message: string) => Promise<void> | void
): HTMLElement {
  const container = document.createElement("div");
  container.className = "input-bar";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Tell monkeybot what to do...";
  input.autocomplete = "off";
  input.spellcheck = false;

  const sendBtn = document.createElement("button");
  sendBtn.className = "send-btn";
  sendBtn.innerHTML = `<span class="send-icon">↑</span>`;
  sendBtn.title = "Send message";

  let sending = false;

  async function send(): Promise<void> {
    const message = input.value.trim();
    if (!message || sending) return;

    sending = true;
    sendBtn.disabled = true;
    input.value = "";

    try {
      await onSend(message);
    } finally {
      sending = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  container.appendChild(input);
  container.appendChild(sendBtn);

  return container;
}
