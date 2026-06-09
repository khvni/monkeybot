import { createTextInput } from "./TextInput";
import { createVoiceButton } from "./VoiceButton";

/**
 * Main chat view — messages list + text/voice input bar.
 */
export function renderChatView(root: HTMLElement): void {
  const container = document.createElement("div");
  container.className = "chat-area";

  // Status bar
  const statusBar = document.createElement("div");
  statusBar.className = "status-bar";
  statusBar.innerHTML = `
    <span><span class="status-dot disconnected"></span>Driver: disconnected</span>
    <span>monkeybot v0.1.0</span>
  `;

  // Messages area
  const messages = document.createElement("div");
  messages.className = "messages";

  function addMessage(text: string, sender: "user" | "agent"): void {
    const msg = document.createElement("div");
    msg.className = `message ${sender}`;
    msg.textContent = text;
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
  }

  // Input bar (text + voice)
  const inputBar = document.createElement("div");
  inputBar.className = "input-bar";

  const textInput = createTextInput(async (message) => {
    addMessage(message, "user");
    const result = await window.monkeybot.sendMessage(message);
    if (result.response) {
      addMessage(result.response, "agent");
    }
  });

  const voiceBtn = createVoiceButton(async (transcript) => {
    addMessage(transcript, "user");
    const result = await window.monkeybot.sendMessage(transcript);
    if (result.response) {
      addMessage(result.response, "agent");
    }
  });

  // Assemble
  container.appendChild(statusBar);
  container.appendChild(messages);

  // Build final input row with voice button
  const finalInputBar = document.createElement("div");
  finalInputBar.className = "input-bar";

  // Move children from textInput into finalInputBar, then add voice btn
  while (textInput.firstChild) {
    finalInputBar.appendChild(textInput.firstChild);
  }
  // Insert voice button before the send button
  const sendBtn = finalInputBar.querySelector(".send-btn");
  if (sendBtn) {
    finalInputBar.insertBefore(voiceBtn, sendBtn);
  } else {
    finalInputBar.appendChild(voiceBtn);
  }

  container.appendChild(finalInputBar);
  root.appendChild(container);
}
