# Forgejo UI

## Project

I built this because I like the GitLab UI more than the Forgejo UI, and I wanted to see if it's
possible to write one myself using Claude.

This is a personal project, built so I can deploy it on my own server. It is not an official
Forgejo project and not intended as a general-purpose product.

## What it is

A GitLab-inspired web interface for [Forgejo](https://forgejo.org): a React/TypeScript SPA
(Tailwind CSS 4) that is compiled and embedded into a lightly patched Forgejo binary. Forgejo still
provides the login session, permissions, repositories and all native actions; the SPA only replaces
the browser UI and is served at `/-/ui/`.

```text
apps/web/              The SPA (React, React Router, TanStack Query, Vite)
integration/forgejo/   Pinned upstream version, patches and added Go handlers
scripts/               Source preparation, build and run commands
tests/                 Playwright and integration tests
```

## Run

With Docker:

```sh
docker compose up -d --build
```

Open `http://localhost:3000/` and complete Forgejo's installation. Set `FORGEJO_ROOT_URL` to the
public URL of your server.

To build locally (Node 22.12+, Go, Git, Make and a C compiler):

```sh
npm ci
npm run build
npm start
```

For SPA development with hot reload against a running backend:

```sh
FORGEJO_URL=http://127.0.0.1:3000 npm run dev
```

## License

Forgejo is licensed under GPL-3.0-or-later, and so is this modified distribution (see `LICENSE`).
