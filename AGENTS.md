# AGENTS.md

n8ncations is an internal site for planning n8n team workations. The frontend in this repo is a static Vite + TypeScript site with no framework. The backend is n8n workflows backed by n8n Data Tables. Those workflows run on the n8n instance, not from this repo. README.md documents the architecture and the API contract; `.n8n/` documents the backend: how each workflow behaves, the Data Tables, and importable workflow blueprints (`.n8n/workflows/`). Read both before making non-trivial changes. CONTRIBUTION.md covers human onboarding (access, MCP setup, pull requests); the rules for agents stay in this file.

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

- **Every feature is behind sign-in. Nothing sensitive is shown, fetched or mounted while signed out.** Only the intro, "What to expect" and the sign-in banner are public.
  - Mark private markup with `data-private`, and mount its feature only from `mountView()` in `main.ts`, which runs only once someone is signed in.
  - The stored session is only decoded in the browser, never verified. Don't reveal a private view until an authenticated API call for it has succeeded. A view that needs no data, such as a form, still makes one (`GET /me`) before it shows anything.
  - Private data comes only from API responses. Never put it in `index.html`, `public/` or `src/data/`: those ship to every visitor.
  - Every n8n route uses JWT Auth and takes the user's identity from `jwtPayload.sub`, never from the request body.
  - Check every new view signed out (no session in localStorage) before handing it back.

- **Every network call goes through `src/api/client.ts`.** When the API contract changes, update `types.ts`, `client.ts` and `mock.ts` together, so mock mode keeps matching the real API.
- **Insert server and user content with `textContent`**, never `innerHTML`.
- **Feature modules (`src/features/*`) don't import each other.** Shared data goes through `main.ts`.
- **Writes are optimistic:** update the UI right away, lock the control while the request is in flight, and roll back on failure.
- **No runtime dependencies.** Ask before adding any package.
- Never put secrets in `VITE_*` variables. They ship in the browser bundle.

## Public repository

This repo is public. Before handing back any change, check the diff for internal company data and remove it. Take extra care in `.n8n/`, which is copied from the live instance.

- **No secrets:** credential values, tokens, API keys, signing keys or OAuth client secrets. Blueprints refer to credentials by id and name only.
- **No personal data:** real people's names, emails, or Slack or Google user ids, and nothing copied from Data Table rows or executions. Keep `pinData` empty (`{}`) in blueprints.
- **No internal names:** real trip places or dates, Slack channel names or ids, Drive folder ids, or internal team names. Use placeholders such as `Example Town, Country` or "the workations Slack channel". Ids the workflows need belong in instance variables (`$vars`), not in the blueprint.
- Ids of the n8n project, folders, workflows, Data Tables and credentials are fine. They are useless without access to the instance.

If you're not sure whether something counts as internal, leave it out and ask me.

## Backend changes (n8n)

I build and edit the n8n workflows myself. If a change needs the backend to change (a new route, a new field, a different response shape), don't work around it in the frontend with tolerant parsing or shims. Instead, tell me exactly what to change in which workflow and node, and update the contract in `types.ts` and README.md to match. Update the affected blueprint in `.n8n/workflows/` and its description in `.n8n/README.md` in the same change. The n8n MCP can read the live workflows and Data Tables: use it to check the live state, and report anything that differs from the contract to me in your reply, naming the workflow and node. Don't change the live instance through the MCP unless I ask you to.

### Working with the n8n MCP

The n8n MCP is connected. Use it to check the live state before you reason about the backend, instead of relying on the blueprints alone.

1. Read the live workflow with `get_workflow_details` before patching. Don't assume it matches its blueprint.
2. Always set `versionName` on `update_workflow` and `create_workflow_from_code`, written like a commit message (not more than 5 words though), plus a `versionDescription` giving details. `publish_workflow` has no name field; it publishes the version that the update created.
3. After changing, read the workflow back and check `activeVersion.sameAsDraft` before saying it's done.
4. Approval to change the live instance covers one set of changes. Ask again for the next.
5. Update the blueprint in `.n8n/workflows/` and `.n8n/README.md` in the same change, and generate live changes from the blueprint so the two match.
6. New workflows go in the project `uAascgo7459L25P4`. If related to the API endpoints use the folder "API endpoints" (`r2395Of2mvIkdy5V`). Check that webhooks use the JWT Auth account credential (`EF3FVWn29g6p0qdG`). Set the error workflow to "🪲 Error Notifier - Slack" (`NQAi3FG6eVyC716s`) with `settings.errorWorkflow`, in the blueprint and on the live workflow.
7. Read execution results with `search_workflow_executions` and `get_workflow_execution`, and check a real execution before saying a route works. Test runs have no session JWT, so they can't exercise the JWT Auth path. If no real execution confirms a change, say the route is untested rather than implying it was tested.

## After every change

Review README.md and any code comments that reference the changed code or behavior, and update them if they no longer match. This covers the API table, the file layout, the Extending steps and mock mode in README.md, and the route behavior, Data Tables and blueprints in `.n8n/`.
