import { createTextInput } from "./TextInput";
import { createVoiceButton } from "./VoiceButton";
import { createKillSwitch } from "./KillSwitch";
import { createStatusBar } from "./StatusBar";

/**
 * Main chat view — status bar, messages, text/voice input, and kill switch.
 */
export function renderChatView(root: HTMLElement): void {
  const container = document.createElement("div");
  container.className = "chat-area";

  // Status bar (connection indicator)
  const statusBar = createStatusBar();

  // Messages area
  const messages = document.createElement("div");
  messages.className = "messages";

  // Empty state
  const emptyState = document.createElement("div");
  emptyState.className = "empty-state";
  emptyState.innerHTML = `
    <div class="empty-icon">🐵</div>
    <p>Ready to assist. Type a command or hold to talk.</p>
  `;
  messages.appendChild(emptyState);

  function addMessage(text: string, sender: "user" | "agent"): void {
    // Remove empty state on first message
    const empty = messages.querySelector(".empty-state");
    if (empty) empty.remove();

    const msg = document.createElement("div");
    msg.className = `message ${sender}`;

    const content = document.createElement("span");
    content.className = "message-content";
    content.textContent = text;
    msg.appendChild(content);

    const time = document.createElement("span");
    time.className = "message-time";
    time.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    msg.appendChild(time);

    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
  }

  // Kill switch
  const killSwitch = createKillSwitch(async () => {
    await window.monkeybot.triggerKillSwitch();
    addMessage("⛔ Kill switch activated — agent halted.", "agent");
  });

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
    if (transcript) {
      addMessage(transcript, "user");
      const result = await window.monkeybot.sendMessage(transcript);
      if (result.response) {
        addMessage(result.response, "agent");
      }
    }
  });

  // Assemble input bar
  while (textInput.firstChild) {
    inputBar.appendChild(textInput.firstChild);
  }
  // Insert voice button before the send button
  const sendBtn = inputBar.querySelector(".send-btn");
  if (sendBtn) {
    inputBar.insertBefore(voiceBtn, sendBtn);
  } else {
    inputBar.appendChild(voiceBtn);
  }

  // Build layout
  container.appendChild(statusBar);
  container.appendChild(killSwitch);
  container.appendChild(messages);
  container.appendChild(inputBar);
  root.appendChild(container);

  // Listen for kill switch event from main process
  window.monkeybot.onKillSwitch(() => {
    addMessage("⛔ Kill switch activated — agent halted.", "agent");
  });
}
