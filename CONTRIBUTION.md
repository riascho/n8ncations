# Contributing to n8ncations

n8ncations is the internal site n8n uses to plan team workations. You can contribute as a maintainer after an invitation. This guide covers how to get access, how the project is put together, and how to get a change merged.

## 1. Get access

You need two kinds of access before you can change anything. Ask the maintainer for both:

- **GitHub:** to be added as a collaborator on [`riascho/n8ncations`](https://github.com/riascho/n8ncations). Without it you can read the code, but you can't push branches or open pull requests from them.
- **n8n:** to be invited to the backend instance, `https://n8ncations.app.n8n.cloud`, and to have the n8ncations project shared with you. You need this to read the backend through the n8n MCP (see [section 4](#4-set-up-the-n8n-mcp)) and to run the site against the real API.

## 2. How the project is split

```
this repo                                  n8n instance
┌─────────────────────────────┐   JSON    ┌──────────────────────────────────┐
│ Static site                 │ ────────▶ │ One workflow per API route       │
│ Vite + TypeScript, no       │  + JWT    │ Data Tables for storage          │
│ framework                   │           │ Google sign-in, schedules, Slack │
└─────────────────────────────┘           └──────────────────────────────────┘
```

- **Frontend, in this repo.** A static Vite + TypeScript site with no framework and no runtime dependencies. All views are in `index.html`, and the logic is in `src/`. Every network call goes through `src/api/client.ts`. `src/api/types.ts` is the API contract, and `src/api/mock.ts` implements the same contract in memory.
- **Backend, in n8n.** n8n workflows on the instance, not code in this repo. Each API route is a webhook workflow, data is stored in n8n Data Tables, and n8n handles Google sign-in and issues the session JWT. Scheduled workflows confirm or expire pitches and create trip photo folders, and a sub-workflow posts to Slack.
- **`.n8n/` mirrors the backend.** [`.n8n/README.md`](.n8n/README.md) describes every workflow, route and Data Table, and [`.n8n/workflows/`](.n8n/workflows) holds an importable blueprint of each workflow. The live instance is the source of truth: when the two differ, the blueprint is updated to match it.
- **The maintainer builds the backend.** You propose backend changes and the maintainer makes them on the instance (see [section 6](#6-changes-that-need-the-backend)).

[README.md](README.md) has the full architecture, the API table and the file layout.

## 3. Set up locally

You need Node.js 22 or newer.

```bash
npm install
npm run dev       # http://localhost:5173
```

- **Mock mode (default).** With no `.env.local`, the site runs against the in-memory API in `src/api/mock.ts`. Use **Sign in (demo)** to see the signed-in views. You need no n8n instance and no Google client, and most UI work only needs this. See [Mock mode](README.md#mock-mode).
- **Live mode.** Copy `.env.example` to `.env.local` and ask the maintainer for the three `VITE_` values. `.env.local` is gitignored: never commit it. `VITE_` values are bundled into the browser, so never put a secret in one.
- **The port is fixed.** `http://localhost:5173` is registered with the Google sign-in client, so live sign-in only works on that port.
- **Fonts.** The n8n Baumer fonts aren't bundled with this repo. Without them installed locally, the site falls back to Helvetica Neue or Arial.

## 4. Set up the n8n MCP

The n8n MCP server lets your coding agent (Claude Code or similar) read the live workflows, Data Tables and executions. Set it up after you have your n8n account from [section 1](#1-get-access).

1. **Open the MCP settings in n8n.** Sign in to `https://n8ncations.app.n8n.cloud`, open **Settings**, then the instance-level **MCP** page. Copy the server URL and the connection details it shows.
2. **Add the server to your agent.** For Claude Code:

   ```bash
   claude mcp add --transport http n8ncations <server URL>
   ```

   Then run `/mcp` in Claude Code and sign in with your own n8n account. If you use an access token instead, keep it in your user or local MCP config, never in a file in this repo.

3. **Check that it works.** Ask your agent to list the workflows in the n8ncations project (`uAascgo7459L25P4`). The list should match the table in [`.n8n/README.md`](.n8n/README.md#workflows).

The MCP only sees what's shared with your n8n account. Use it to read the live state before reasoning about the backend. Don't change the live instance through it unless the maintainer asks you to.

## 5. Make a change

1. **Read the rules first.** [AGENTS.md](AGENTS.md) has the code rules: everything behind sign-in, `textContent` only, optimistic writes, no runtime dependencies. For any UI, also read [n8ndesign.md](n8ndesign.md) and use the tokens in `src/styles/tokens.css`. Coding agents load both automatically through `CLAUDE.md`.
2. **Work on a branch.** Branch from `main` and open a pull request. Don't push to `main` directly: every push to `main` deploys the site to GitHub Pages.
3. **Keep the contract in step.** When the API contract changes, update `types.ts`, `client.ts` and `mock.ts` together, so mock mode keeps matching the real API. Update README.md when the API table, file layout, mock mode or extending steps no longer match.
4. **Check before you open the pull request:**
   - `npm run build` passes (type check and bundle). There is no test suite, so this is the check.
   - `npm run format` has been run.
   - The change works in the browser in mock mode.
   - Any new view shows nothing private when signed out (no session in localStorage).
   - The diff passes the [public repository](#7-this-repository-is-public) check.
5. **Write short commit messages.** Lowercase and imperative, like the existing history, for example `add trip photos for past n8ncations`.

The maintainer reviews and merges every pull request.

## 6. Changes that need the backend

If a change needs a new route, a new field or a different response shape:

- Don't work around it in the frontend with tolerant parsing or shims.
- In the pull request, describe exactly what should change, in which workflow and node.
- Update the contract in `src/api/types.ts`, the API table in README.md, the affected blueprint in `.n8n/workflows/` and its description in `.n8n/README.md` in the same pull request.
- The maintainer makes the change on the instance. Until then, mock mode shows the new behavior.

If you notice the live instance differing from the contract or a blueprint, say so in your pull request or tell the maintainer, naming the workflow and node.

## 7. This repository is public

Check every diff for internal company data before you commit, and take extra care in `.n8n/`, which is copied from the live instance. The full rules are in [AGENTS.md](AGENTS.md#public-repository). In short:

- No secrets: credential values, tokens, API keys or signing keys.
- No personal data: real people's names, emails or user ids, and nothing copied from Data Table rows or executions. Keep `pinData` empty (`{}`) in blueprints.
- No internal names: real trip places or dates, Slack channel names or ids, or Drive folder ids. Use placeholders.
- Internal text, such as the People Ops guidelines, stays in its Data Table on the instance.

When you're not sure, leave it out and ask.

## 8. Questions and bugs

Ask the maintainer on the n8n Slack. For a bug, include the page, what you did, what you expected and what happened.
