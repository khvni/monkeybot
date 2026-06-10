/**
 * Renderer entry point.
 * Vanilla TS — lightweight menu bar app.
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
      getApiKeys: () => Promise<{
        openRouter: string;
        assemblyAi: string;
        elevenLabs: string;
      }>;
      sendMessage: (message: string) => Promise<{ response: string }>;
      voiceStart: () => Promise<{ success: boolean }>;
      voiceStop: () => Promise<{ transcript: string }>;
      triggerKillSwitch: () => Promise<{ success: boolean }>;
      getDriverStatus: () => Promise<{ connected: boolean }>;
      onDriverStatus: (cb: (connected: boolean) => void) => void;
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
}

init();
