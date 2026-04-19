# Claude Code Studio

Local web UI wrapper around the [Claude Code](https://docs.claude.com/en/docs/claude-code) CLI.
Lets you browse `~/.claude/projects`, resume sessions, manage git worktrees,
edit memory files (`CLAUDE.md`), agents and skills — all from a browser tab.

The app runs **only on loopback** (`127.0.0.1`). There is no authentication;
do not expose it to a network.

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

- `server/index.js` — single-file Express app. Exposes `/api/*` for sessions,
  worktrees, memory, agents, skills, prefs, and two WebSockets (`/pty` for a
  Claude-CLI-backed PTY, `/pty/shell` for a plain shell).
- `web/` — React + Vite SPA. Uses a Vite proxy so `/api` and `/pty` reach the
  backend during development.
- `start.sh` — dev launcher invoked by `npm run dev`.
- `docs/buffer-replay.md` — notes on terminal buffer replay.

## Repo layout

```
.
├── server/              backend (Express + node-pty)
│   ├── index.js         all routes and PTY lifecycle
│   └── scripts/         postinstall helpers
├── web/                 frontend (React + Vite + Tailwind)
│   ├── src/
│   └── vite.config.ts
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
