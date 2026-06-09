# monkeybot

A computer-use agent that users can teach by recording themselves performing tasks.

`monkeybot` bridges the gap between manual workflows and autonomous agents by allowing users to "show" the agent what to do through screen recordings, which are then transformed into reproducible, intelligent skills.

## Architecture

### Monorepo Structure (pnpm workspace)

```
monkeybot/
├── apps/
│   └── desktop/              # Electron menu bar app (push-to-talk + text input)
├── packages/
│   ├── monkey-see/           # Recording engine (screen + input capture)
│   ├── monkey-say/           # Voice layer (AssemblyAI STT, ElevenLabs TTS)
│   ├── monkey-do/            # Core agent harness (action execution, skill replay)
│   ├── orchestrator/         # TS ↔ Rust IPC via Unix sockets, OpenRouter model routing
│   ├── storage/              # SQLite: trajectories, action graphs, NL summaries
│   └── safety/               # App allowlist, confirmation prompts, kill switch
├── crates/
│   └── cua-driver-rs/        # Rust CUA driver daemon (Unix socket server)
├── pnpm-workspace.yaml
├── Cargo.toml                # Cargo workspace
└── tsconfig.json             # Project references root
```

### Core Pillars

1. **monkey-see** — Recording engine. Captures screen, cursor movements, clicks, and typed input to output structured action data from user demonstrations.
2. **monkey-say** — Voice interaction layer. Realtime voice-based communication (AssemblyAI STT, ElevenLabs TTS) for teaching the agent and giving direction.
3. **monkey-do** — Computer-use agent harness. Executes actions on the screen, replays learned skills, and manages goal-directed execution.

### Execution Layer

- **CUA Driver** (`crates/cua-driver-rs`): Rust daemon using [trycua/cua](https://github.com/trycua/cua) for host-based (not sandboxed) computer-use execution.
- **IPC**: Newline-delimited JSON over Unix sockets between the Rust driver and TypeScript orchestrator.
- **Safety**: App allowlist, confirmation prompts for destructive actions, and a kill switch (keyboard shortcut + tray menu).

### Model Routing (OpenRouter)

| Profile     | Model                    | Use Case                              |
| ----------- | ------------------------ | ------------------------------------- |
| `fast`      | Gemini 1.5 Flash         | Repetitive inference cycles           |
| `reasoning` | Claude 3.5 Sonnet        | Complex reasoning and planning        |
| `fallback`  | GPT-4o                   | General-purpose fallback              |

### Learning Representation (Hybrid)

- **Raw Trajectories**: Timestamped sequences of user actions (clicks, keystrokes, screenshots).
- **Abstracted Action Graphs**: DAGs derived from trajectories capturing reusable workflow structure.
- **Natural Language Summaries**: LLM-generated descriptions of workflows for retrieval and search.

### Storage

SQLite (via `better-sqlite3`) for local persistence:
- Trajectories + steps
- Action graphs (nodes + edges)
- NL summaries
- API key storage (onboarding)
- App allowlist (safety)

## Getting Started

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- Rust (latest stable)

### Install & Build

```bash
pnpm install
pnpm build:packages

# Rust driver
cargo build --manifest-path crates/cua-driver-rs/Cargo.toml
```

### Development

```bash
# Run the Electron app
pnpm dev

# Type-check the entire workspace
pnpm typecheck

# Lint
pnpm lint
```

### Onboarding

On first launch, the app prompts for API keys:
- **OpenRouter** (required): For model routing (Gemini Flash, Claude Sonnet, GPT-4o)
- **AssemblyAI** (optional): For push-to-talk voice input
- **ElevenLabs** (optional): For text-to-speech responses

## UX Pattern & Inspiration

The user experience of `monkeybot` is heavily inspired by **[Clicky](https://github.com/farzaa/clicky)**. It follows a similar cursor-following, accessibility-based interaction model that feels seamless and intuitive.

Other key inspirations include:
- **Claude for Chrome**: The record-workflow-to-skill-invocation loop.
- **Codex Computer Use**: Open-ended, generalized computer control.

## License

MIT
