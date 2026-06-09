# monkeybot

A computer-use agent that users can teach by recording themselves performing tasks. 

`monkeybot` bridges the gap between manual workflows and autonomous agents by allowing users to "show" the agent what to do through screen recordings, which are then transformed into reproducible, intelligent skills.

## Core Features

- **monkey-see**: Recording Pipeline. Capture screen, clicks, and keystrokes to create a "skill".
- **monkey-do**: Skill Invocation Engine. Intelligent replay that understands intent, not just coordinates.
- **Accessibility-Based Screen Understanding**: High-fidelity UI interaction using OS-level accessibility APIs.
- **Computer Use Agent**: Generalized computer use capability informed by user-recorded skills.

## Inspiration

- **Clicky**: Cursor-following and accessibility-based interaction.
- **Claude for Chrome**: Record workflow → skill → invoke.
- **Codex Computer Use**: Open-ended, generalized computer control.

## Project Structure

- `packages/monkey-see`: Screen and input capture modules.
- `packages/monkey-do`: Engine for replaying and executing skills (formerly skill-execution).
- `packages/skill-extraction`: Logic to transform recordings into structured skills.
- `packages/screen-understanding`: OS-level accessibility and vision integration.
- `packages/accessibility`: Accessibility API wrappers.

## License

MIT
