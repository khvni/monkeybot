/**
 * Renderer entry point.
 * Vanilla TS for now — can be migrated to React/Svelte later.
 */

import { renderOnboarding } from "./components/Onboarding";
import { renderChatView } from "./components/ChatView";

declare global {
  interface Window {
    monkeybot: {
      saveApiKeys: (keys: {
        openRouter: string;
        assemblyAi: string;
        elevenLabs: string;
      }) => Promise<{ success: boolean }>;
      checkOnboarding: () => Promise<{ complete: boolean }>;
      sendMessage: (message: string) => Promise<{ response: string }>;
      voiceStart: () => Promise<{ success: boolean }>;
      voiceStop: () => Promise<{ transcript: string }>;
      triggerKillSwitch: () => Promise<{ success: boolean }>;
      onWatchMeToggle: (cb: (active: boolean) => void) => void;
      onKillSwitch: (cb: () => void) => void;
    };
  }
}

async function init(): Promise<void> {
  const root = document.getElementById("root");
  if (!root) return;

  const { complete } = await window.monkeybot.checkOnboarding();

  if (!complete) {
    renderOnboarding(root, () => {
      root.innerHTML = "";
      renderChatView(root);
    });
  } else {
    renderChatView(root);
  }

  // Listen for kill switch from main process.
  window.monkeybot.onKillSwitch(() => {
    const banner = document.createElement("div");
    banner.className = "kill-banner";
    banner.textContent = "KILL SWITCH ACTIVATED — Agent halted";
    root.prepend(banner);
  });
}

init();
