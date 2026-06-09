/**
 * Text input component for sending messages to the agent.
 */
export function createTextInput(onSend: (message: string) => void): HTMLElement {
  const container = document.createElement("div");
  container.className = "input-bar";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Tell monkeybot what to do...";

  const sendBtn = document.createElement("button");
  sendBtn.className = "send-btn";
  sendBtn.textContent = "Send";

  function send(): void {
    const message = input.value.trim();
    if (!message) return;
    onSend(message);
    input.value = "";
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });

  container.appendChild(input);
  container.appendChild(sendBtn);

  return container;
}
