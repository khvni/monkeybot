import type { RecordingSession, CapturedEvent, TrajectoryResult } from "./types";
import type { Trajectory, TrajectoryStep } from "@monkeybot/storage";
import { randomUUID } from "node:crypto";

/**
 * Converts a raw RecordingSession into a structured Trajectory.
 * Processes events into timestamped action steps with metadata.
 */
export class TrajectoryGenerator {
  /**
   * Convert a recording session into a Trajectory object.
   * Groups related events and normalizes them into steps.
   */
  generate(session: RecordingSession, name?: string): Trajectory {
    const steps = this.eventsToSteps(session.events);
    const now = Math.floor(Date.now() / 1000);

    return {
      id: randomUUID(),
      workflowId: session.workflowId,
      name: name ?? `Recording ${session.id}`,
      steps,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Convert raw captured events into structured trajectory steps.
   * Consecutive keystrokes are merged into typed text segments.
   */
  private eventsToSteps(events: CapturedEvent[]): TrajectoryStep[] {
    const steps: TrajectoryStep[] = [];
    let keyBuffer: { keys: string[]; startTs: number; endTs: number } | null = null;

    const flushKeyBuffer = () => {
      if (keyBuffer && keyBuffer.keys.length > 0) {
        steps.push({
          action: "type",
          text: keyBuffer.keys.join(""),
          timestamp: keyBuffer.startTs,
          meta: {
            keyCount: keyBuffer.keys.length,
            durationMs: keyBuffer.endTs - keyBuffer.startTs,
          },
        });
        keyBuffer = null;
      }
    };

    for (const event of events) {
      switch (event.type) {
        case "click": {
          flushKeyBuffer();
          steps.push({
            action: "click",
            x: event.x,
            y: event.y,
            timestamp: event.timestamp,
            meta: { button: event.button ?? "left" },
          });
          break;
        }

        case "keydown": {
          if (!event.key) break;
          // Merge consecutive keystrokes into a single "type" step
          if (!keyBuffer) {
            keyBuffer = { keys: [], startTs: event.timestamp, endTs: event.timestamp };
          }
          keyBuffer.keys.push(event.key);
          keyBuffer.endTs = event.timestamp;
          break;
        }

        case "keyup": {
          // keyup is tracked but doesn't produce a step directly
          break;
        }

        case "scroll": {
          flushKeyBuffer();
          steps.push({
            action: "scroll",
            x: event.x,
            y: event.y,
            timestamp: event.timestamp,
            meta: {
              dx: event.scrollDelta?.dx ?? 0,
              dy: event.scrollDelta?.dy ?? 0,
            },
          });
          break;
        }

        case "mouse_move": {
          // Downsample mouse moves — only include significant movements
          const lastStep = steps[steps.length - 1];
          if (lastStep?.action === "mouse_move") {
            const dx = (event.x ?? 0) - (lastStep.x ?? 0);
            const dy = (event.y ?? 0) - (lastStep.y ?? 0);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 50) break; // Skip tiny movements
          }
          flushKeyBuffer();
          steps.push({
            action: "mouse_move",
            x: event.x,
            y: event.y,
            timestamp: event.timestamp,
          });
          break;
        }
      }
    }

    flushKeyBuffer();
    return steps;
  }

  /**
   * Get a result summary for a generated trajectory.
   */
  toResult(trajectory: Trajectory): TrajectoryResult {
    return {
      trajectoryId: trajectory.id,
      stepCount: trajectory.steps.length,
    };
  }
}
