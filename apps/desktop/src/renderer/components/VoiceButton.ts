/**
 * Push-to-talk voice input button.
 * Hold to record, release to send. Visual indicator during recording.
 */
export function createVoiceButton(
  onTranscript: (transcript: string) => void
): HTMLElement {
  const btn = document.createElement("button");
  btn.className = "voice-btn";
  btn.innerHTML = `<span class="mic-icon">🎙</span>`;
  btn.title = "Hold to talk";

  let recording = false;
  let recordingTimer: ReturnType<typeof setInterval> | null = null;
  let recordingDuration = 0;

  function startRecordingUI(): void {
    btn.classList.add("recording");
    btn.innerHTML = `<span class="mic-icon">🔴</span><span class="recording-time">0s</span>`;
    recordingDuration = 0;
    recordingTimer = setInterval(() => {
      recordingDuration++;
      const timeEl = btn.querySelector(".recording-time");
      if (timeEl) timeEl.textContent = `${recordingDuration}s`;
    }, 1000);
  }

  function stopRecordingUI(): void {
    btn.classList.remove("recording");
    btn.innerHTML = `<span class="mic-icon">🎙</span>`;
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }
    recordingDuration = 0;
  }

  btn.addEventListener("mousedown", async (e) => {
    e.preventDefault();
    if (recording) return;
    recording = true;
    startRecordingUI();
    await window.monkeybot.voiceStart();
  });

  btn.addEventListener("mouseup", async () => {
    if (!recording) return;
    recording = false;
    stopRecordingUI();
    const result = await window.monkeybot.voiceStop();
    if (result.transcript) {
      onTranscript(result.transcript);
    }
  });

  // Handle mouse leaving the button while held.
  btn.addEventListener("mouseleave", async () => {
    if (!recording) return;
    recording = false;
    stopRecordingUI();
    await window.monkeybot.voiceStop();
  });

  // Keyboard accessibility: Space/Enter to toggle
  btn.addEventListener("keydown", async (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!recording) {
        recording = true;
        startRecordingUI();
        await window.monkeybot.voiceStart();
      }
    }
  });

  btn.addEventListener("keyup", async (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (recording) {
        recording = false;
        stopRecordingUI();
        const result = await window.monkeybot.voiceStop();
        if (result.transcript) {
          onTranscript(result.transcript);
        }
      }
    }
  });

  return btn;
}
