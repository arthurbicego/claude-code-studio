# Claude Code Studio

A local mission-control dashboard for the [Claude Code](https://docs.claude.com/en/docs/claude-code)
CLI. Run multiple sessions in parallel, manage git worktrees first-class, and
keep an eye on the model's plan, tasks, diff, cost and quota — all in your
browser, no extra service to configure.

> Runs only on loopback (`127.0.0.1`). There is no authentication; do not
> expose it to a network.

<!-- TODO: replace with a real screenshot of the running app -->
<!-- ![Claude Code Studio overview](docs/screenshot.png) -->

## What you get over the bare CLI

- **Multiple concurrent sessions** with state badges (waiting / active /
  standby / closed) — no more juggling tmux panes.
- **Worktrees first-class**: create one straight from the *New session*
  modal, work in isolation, then close the session with a guided dialog
  (keep / commit / merge fast-forward / discard).
- **Live mission-control panels** alongside the terminal:
  - **Plan** — the plan the model is building.
  - **Tasks** — TODOs the model is tracking.
  - **Diff** — uncommitted changes in the working tree.
  - **Terminal** — extra (non-Claude) shell sharing the same cwd.
  - **Worktrees** — full lifecycle for the project's worktrees.
- **Cost and quota in the footer**: per-session spend, plus rolling
  5h/7d quota usage with reset countdowns.
- **In-app editors** for `CLAUDE.md` (global / shared / personal),
  agents, skills, and sandbox JSON — auto-saved, no save button.
- **Searchable sidebar** that filters across Open / History / Archived by
  preview text or session ID.
- **i18n**: pt-BR, en-US, es-ES. Persisted in your user preferences.
- **Help guide** built in (the `?` button) covering every feature.

## Requirements

- Node.js 20+
- The `claude` CLI on your `PATH` (`which claude` must succeed)
- macOS or Linux (uses `lsof` / `open` in `start.sh`; backend itself is portable)
- `git` on your `PATH` (required for worktree features)

## Getting started

```bash
npm install            # installs server deps (also runs the web install on first dev run)
npm run dev            # starts backend on :3000 and Vite dev server on :5173
```

`npm run dev` is a thin wrapper over `start.sh`: it kills anything already
holding the two ports, installs `web/node_modules` if missing, runs both
processes in parallel, and opens the browser when Vite is ready. Hit `Ctrl+C`
once to stop both.

### Production-style run

```bash
npm --prefix web run build    # produces web/dist
npm start                     # serves the SPA + API from the backend on :3000
```

When `web/dist` exists the backend serves it as static assets, so you can point
your browser directly at `http://127.0.0.1:3000` without Vite.

## Environment variables

| Variable | Default | Effect |
| --- | --- | --- |
| `PORT` | `3000` | Backend HTTP port. The Vite dev proxy assumes `3000`, so change both if you override this. |
| `SHELL` | auto-detected (`zsh`/`bash`/`sh`) | Shell used for the interactive terminal panel. |

The backend discovers the `claude` binary via `which claude`, falling back to
`~/.local/bin/claude`, `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`.

## Architecture

```
┌─────────────┐   HTTP + WebSocket   ┌─────────────────────────┐
│  web (Vite) │  ─────────────────▶  │  server (Express + PTY) │
│  React 19   │                       │  node-pty spawns the    │
│  Tailwind 4 │  ◀─────────────────  │  `claude` CLI per panel │
└─────────────┘                       └─────────────────────────┘
                                               │
                                               ▼
                                       ~/.claude/projects
                                       git worktrees
                                       CLAUDE.md files
```

- `server/` — Express app exposing `/api/*` for sessions, worktrees, memory,
  agents, skills, prefs, and two WebSockets (`/pty` for a Claude-CLI-backed
  PTY, `/pty/shell` for a plain shell).
- `web/` — React + Vite SPA. Uses a Vite proxy so `/api` and `/pty` reach the
  backend during development.
- `shared/` — TypeScript types shared between server and web.
- `start.sh` — dev launcher invoked by `npm run dev`.
- `docs/buffer-replay.md` — notes on terminal buffer replay.

## Repo layout

```
.
├── server/              backend (Express + node-pty, TypeScript)
├── shared/              shared TS types between server and web
├── web/                 frontend (React + Vite + Tailwind + i18next)
│   ├── src/
│   │   ├── components/  panels, dialogs, settings tabs
│   │   ├── hooks/       prefs, save status, session lifecycle
│   │   └── i18n/        config + locale JSONs
│   └── vite.config.ts
├── e2e/                 Playwright smoke tests
├── docs/                design notes
├── start.sh             dev launcher
└── package.json         server deps + top-level scripts
```

## Useful scripts

Root:

- `npm run dev` — backend + frontend for development
- `npm start` — backend only (use after `vite build`)
- `npm run check` — Biome lint + format check (whole repo)
- `npm run fix` — Biome lint + format with safe autofixes
- `npm run format` — Biome format only (writes changes)
- `npm run typecheck` — tsc --noEmit on server and web
- `npm test` — Vitest unit tests (one-shot)
- `npm run test:watch` — Vitest in watch mode
- `npm run test:e2e` — Playwright smoke E2E (spawns dev server if needed)

Inside `web/`:

- `npm run dev` — Vite dev server
- `npm run build` — type-check + production build
- `npm run preview` — preview the built SPA

## Security note

The server binds to `127.0.0.1` and has no authentication. Any local process
that reaches port 3000 can run shell commands, edit files under `$HOME`, and
interact with your Claude sessions. Treat the tool as single-user on a trusted
machine. Do not forward the port or bind it to `0.0.0.0`.
