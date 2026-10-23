# AGENTS.md

n8ncations is an internal site for planning n8n team workations. The frontend in this repo is a static Vite + TypeScript site with no framework. The backend is n8n workflows backed by n8n Data Tables. Those workflows are **not in this repo**. README.md documents the architecture, the API contract and the data model. Read it before making non-trivial changes.

## Commands

```bash
npm run dev       # http://localhost:5173, port is fixed (Google OAuth origin)
npm run build     # tsc --noEmit + vite build: the check to run after every change
npm run format    # Prettier
```

There is no test suite. A change is verified when `npm run build` passes and, for UI changes, the affected view works in the browser in mock mode (leave `VITE_API_BASE` unset).

## Design

Before you design or build any UI, read n8ndesign.md and follow it exactly: colors, spacing, type and logo usage.

- Use the tokens in `src/styles/tokens.css`. Never add raw hex values, off-scale sizes or spacing.
- Only use the official logo files in `public/`. Never draw or recreate the logo.
- If something isn't covered by n8ndesign.md, ask me instead of guessing.

## Code rules

- **Every network call goes through `src/api/client.ts`.** When the API contract changes, update `types.ts`, `client.ts` and `mock.ts` together, so mock mode keeps matching the real API.
- **Insert server and user content with `textContent`**, never `innerHTML`.
- **Feature modules (`src/features/*`) don't import each other.** Shared data goes through `main.ts`.
- **Writes are optimistic:** update the UI right away, lock the control while the request is in flight, and roll back on failure.
- **No runtime dependencies.** Ask before adding any package.
- Never put secrets in `VITE_*` variables. They ship in the browser bundle.

## Backend changes (n8n)

I build and edit the n8n workflows myself. If a change needs the backend to change (a new route, a new field, a different response shape), don't work around it in the frontend with tolerant parsing or shims. Instead, tell me exactly what to change in which workflow and node, and update the contract in `types.ts` and README.md to match.

## After every change

Review README.md and any code comments that reference the changed code or behavior, and update them if they no longer match. This covers the API table, the Data Tables, the file layout, the Extending steps and mock mode.
