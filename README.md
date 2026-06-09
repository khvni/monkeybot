# monkeybot

A computer-use agent that learns by watching you work.

Instead of writing prompts or configuring automations, you **show** monkeybot what to do — record yourself performing a task, talk it through, and the agent learns a replayable skill it can execute on its own.

## See, Say, Do

Monkeybot is built around three pillars:

| Pillar | Package | Role |
|--------|---------|------|
| **See** | `packages/monkey-see` | Records what you do — screen capture, cursor tracking, clicks, keystrokes — and outputs structured action data. |
| **Say** | `packages/monkey-say` | Listens while you work — realtime voice interaction for teaching, directing, and giving feedback to the agent. |
| **Do** | `packages/monkey-do` | Acts on what it learned — accessibility-based computer use, file editing, terminal commands, code generation, and multi-agent dispatch via ACP. |

The loop is simple: **demonstrate → narrate → replay**.

## Packages

### `@monkeybot/monkey-see`

Recording engine. Captures screen frames, cursor position, click coordinates, scroll events, and keystrokes. Produces a structured `Recording` object that downstream packages consume.

### `@monkeybot/monkey-say`

Voice interaction layer. Handles speech-to-text, intent classification (teach / command / feedback), and confidence scoring. Designed for realtime, hands-free communication with the agent while you work.

### `@monkeybot/monkey-do`

Action harness. Takes demonstrations from `monkey-see` and direction from `monkey-say` and turns them into executable `Skill` objects. Capabilities include:

- **Computer use** — accessibility-based cursor control and UI interaction (macOS focus).
- **Coding** — file editing, terminal commands, code generation.
- **ACP dispatching** — orchestrates other agents via the Agent Client Protocol.

## Getting Started

```bash
# install dependencies
pnpm install

# typecheck all packages
pnpm typecheck

# build all packages
pnpm build
```

## Project Structure

```
monkeybot/
├── packages/
│   ├── monkey-see/     # recording engine
│   ├── monkey-say/     # voice interaction
│   └── monkey-do/      # agent harness
├── package.json        # workspace root
├── pnpm-workspace.yaml
├── tsconfig.json       # shared compiler options
└── ROADMAP.md
```

## Inspirations

- **[Clicky](https://github.com/farzaa/clicky)** — cursor-following, accessibility-driven interaction model. Monkeybot's UX borrows heavily from Clicky's approach to making computer use feel seamless and intuitive.
- **Claude for Chrome (research preview)** — the record-a-workflow-then-invoke-it-as-a-skill loop. Monkeybot generalises this beyond the browser to the full desktop.
- **Codex Computer Use** — open-ended, generalized computer control. Monkeybot adds a user-teaching dimension: rather than relying solely on foundation-model knowledge, it learns from *your* specific workflows.

## License

MIT
