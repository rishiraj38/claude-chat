# Claude Chat

A Claude-style chat app you run with your own Anthropic API key. Streaming replies, model picker (pulled live from the API), effort control, visible thinking, markdown + code highlighting, and an artifacts side panel that previews HTML, SVG, React components, and documents the model produces.

No build step, no dependencies. One Node file + one HTML file.

## Two ways to run it

### 1. With a server (recommended) — key stays on the server

The key lives in an environment variable. The browser never sees it.

```bash
cp .env.example .env     # put your key in ANTHROPIC_API_KEY
export $(cat .env | xargs)
npm start                # http://localhost:3000
```

Deploy from this GitHub repo to any host that runs Node:

| Host | How |
|------|-----|
| **Render** | New → Blueprint → pick this repo (uses `render.yaml`). Add `ANTHROPIC_API_KEY` (and `APP_PASSWORD`) in the env vars screen. |
| **Railway** | New project → Deploy from GitHub → add the two variables → done. |
| **Fly.io** | `fly launch` (uses the Dockerfile) then `fly secrets set ANTHROPIC_API_KEY=...` |
| Anything with Docker | `docker build -t claude-chat . && docker run -p 3000:3000 -e ANTHROPIC_API_KEY=... claude-chat` |

**Set `APP_PASSWORD`** if the URL is reachable by anyone else. Without it, whoever finds the link spends your credits.

### 2. Static on GitHub Pages — key stays in your browser

GitHub Pages can't run a server, so there's nowhere safe to hold the key. In this mode the page asks you for the key once and keeps it in your browser's localStorage, calling the Claude API directly. The included workflow (`.github/workflows/pages.yml`) publishes `public/` on every push to `main`; enable Pages → Source: GitHub Actions in the repo settings.

Don't add your key as a GitHub secret for this mode. A static site can't keep secrets: anything injected at build time ships to every visitor.

## Env vars

| Var | Required | What |
|-----|----------|------|
| `ANTHROPIC_API_KEY` | yes (server mode) | Your key from platform.claude.com |
| `APP_PASSWORD` | no | Shared password the UI must send; protects a public URL |
| `PORT` | no | Defaults to 3000 |

## How artifacts work

The system prompt tells the model to wrap substantial deliverables in `<artifact type="..." title="...">…</artifact>` tags. The UI pulls those out of the reply, shows a card inline, and renders them in the right-hand panel: HTML and SVG in a sandboxed iframe, React (JSX) via React 18 + Babel standalone + Tailwind loaded from CDN, markdown rendered, everything else as highlighted code. Copy and download buttons are in the panel header.

## Sharing artifacts

The share button in the artifact panel copies a public link. The artifact is compressed and base64-encoded into the URL fragment of `share.html`, which renders it for anyone who opens it. Nothing is uploaded or stored: the link *is* the artifact, so it works on the static GitHub Pages deployment too. Long documents produce long links (a 15 KB document is roughly a 7 KB URL); browsers handle this fine, but some chat apps truncate very long URLs, in which case send it as a file or use Download instead.

## Settings

Gear icon → system prompt, API key (direct mode), app password. Model, effort (`low`→`max`), max tokens and "show thinking" are in the top bar / composer. Chats are stored in localStorage; "Delete all chats" is in settings.
