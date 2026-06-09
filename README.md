# monkeybot

A computer-use agent that users can teach by recording themselves performing tasks. 

`monkeybot` bridges the gap between manual workflows and autonomous agents by allowing users to "show" the agent what to do through screen recordings, which are then transformed into reproducible, intelligent skills.

## Core Architecture

The system is built on three pillars:

1.  **monkey-see** (`packages/monkey-see`): The recording engine. It captures screen, cursor movements, clicks, and typed input to output structured action data from user demonstrations.
2.  **monkey-say** (`packages/monkey-say`): The voice interaction layer. Realtime voice-based communication for telling the agent what to do, teaching it tasks, and giving direction in real time.
3.  **monkey-do** (`packages/monkey-do`): The computer-use-enabled agent harness. This is the heart of the agent, taking direction from both user demonstrations and voice input.

## Features

- **Voice-First Teaching**: Talk to the agent to guide it or teach it new workflows.
- **Demonstration Replay**: Record yourself doing a task and let the agent learn and replicate the "skill".
- **Advanced Computer Use**: Accessibility-based interaction (macOS focus) that allows the cursor to take actions on the screen.
- **Coding Capabilities**: Performs file editing, terminal commands, and code generation.
- **Multi-Agent Orchestration**: Can dispatch other agents via the Agent Client Protocol (ACP).

## UX Pattern & Inspiration

The user experience of `monkeybot` is heavily inspired by **[Clicky](https://github.com/farzaa/clicky)**. It follows a similar cursor-following, accessibility-based interaction model that feels seamless and intuitive.

Other key inspirations include:
- **Claude for Chrome**: The record-workflow-to-skill-invocation loop.
- **Codex Computer Use**: Open-ended, generalized computer control.

## Project Structure

- `packages/monkey-see`: Recording and input capture modules.
- `packages/monkey-say`: Realtime voice interaction and processing.
- `packages/monkey-do`: Core agent logic, computer use, and coding execution.

## License

MIT
