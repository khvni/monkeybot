/**
 * Push-to-talk voice input button.
 * Hold to record, release to send.
 */
export function createVoiceButton(
  onTranscript: (transcript: string) => void
): HTMLElement {
  const btn = document.createElement("button");
  btn.className = "voice-btn";
  btn.textContent = "Hold to Talk";

  let recording = false;

  btn.addEventListener("mousedown", async () => {
    if (recording) return;
    recording = true;
    btn.classList.add("recording");
    btn.textContent = "Listening...";
    await window.monkeybot.voiceStart();
  });

  btn.addEventListener("mouseup", async () => {
    if (!recording) return;
    recording = false;
    btn.classList.remove("recording");
    btn.textContent = "Hold to Talk";
    const result = await window.monkeybot.voiceStop();
    if (result.transcript) {
      onTranscript(result.transcript);
    }
  });

  // Handle mouse leaving the button while held.
  btn.addEventListener("mouseleave", async () => {
    if (!recording) return;
    recording = false;
    btn.classList.remove("recording");
    btn.textContent = "Hold to Talk";
    await window.monkeybot.voiceStop();
  });

  return btn;
}
