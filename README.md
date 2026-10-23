# n8ncations

An internal site for planning n8n team workations. Colleagues sign in with their n8n Google account to:

- browse upcoming and past n8ncations
- RSVP to an upcoming trip
- vote on which months and locations work for the next one, and suggest new locations
- keep a small profile (team, job title) and see the trips they signed up for

The UI follows the post-rebrand n8n design system described in [`n8ndesign.md`](n8ndesign.md). Its tokens are implemented in `src/styles/tokens.css`.

---

## Architecture

```
┌──────────────────────────┐   fetch (JSON)    ┌──────────────────────────┐        ┌──────────────────┐
│ Static site              │ ────────────────▶ │ n8n workflow             │ ─────▶ │ n8n Data Tables  │
│ Vite + TypeScript,       │  Bearer <JWT> on  │ "API endpoints"          │        │ workations,      │
│ no framework             │  private routes   │ (one webhook per route)  │        │ signups, votes,  │
└────────────┬─────────────┘                   └──────────────────────────┘        │ poll_options,    │
             │ sign-in (popup)                 ┌──────────────────────────┐        │ profiles         │
             ▼                                 │ n8n workflow             │ ─────▶ │                  │
      Google OAuth 2.0 ──── auth code ───────▶ │ "Google OAuth Login"     │        └──────────────────┘
                                               │ issues the session JWT   │
                                               └──────────────────────────┘
```

- **Frontend:** a single `index.html` holds every view, plus TypeScript modules bundled by Vite. It has no runtime dependencies.
- **Backend:** n8n workflows only. Each API route is a Webhook trigger that ends in a Respond to Webhook node.
- **Storage:** n8n Data Tables, which are only read or written through those workflows.
- **Auth:** Google OAuth with n8n as the confidential client. n8n signs its own session JWT, and the browser never sees a Google token.

---

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173 (port is fixed, see below)
npm run build     # type-check (tsc --noEmit), then bundle to dist/
npm run preview   # serve the built dist/ locally
npm run format    # Prettier
```

With no environment variables set, the app runs in **mock mode** (see [Mock mode](#mock-mode)). You need no n8n instance and no Google client.

The dev port is pinned (`strictPort: true` in `vite.config.ts`) because `http://localhost:5173` has to be registered as an authorized JavaScript origin on the Google OAuth client.

---

## Configuration

### Environment variables

Copy `.env.example` to **`.env.local`** (gitignored) and fill it in. Vite doesn't read `.env.example`. Only `VITE_`-prefixed variables reach the browser, and they're **baked into the bundle at build time**, so changing one means rebuilding.

| Variable                | Purpose                                                                                                                                                                                                                                            | Example                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `VITE_API_BASE`         | Base URL of the n8n webhook API, **no trailing slash**. Leave empty for mock mode.                                                                                                                                                                 | `https://<your-instance>/webhook`                     |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID. Public by design; it ships in the bundle. The client **secret** never goes here.                                                                                                                                           | `<id>.apps.googleusercontent.com`                     |
| `VITE_OAUTH_REDIRECT`   | Absolute URL of the n8n OAuth callback webhook. Must match an Authorized redirect URI on the Google client exactly. n8n's test and production webhooks have different paths (`/webhook-test/…` vs `/webhook/…`), so register the one you point at. | `https://<your-instance>/webhook/n8ncations/callback` |

### Hosting requirements

The build in `dist/` is plain static files. Any static host works, as long as:

1. **It serves from the domain root.** Links and assets use absolute paths (`/`, `/me`, `/n8ncation/<slug>`, `/n8n-logo-black-accent.svg`). Serving from a sub-path would need a Vite `base` setting and path changes in the code.
2. **Unknown paths fall back to `index.html` with status 200.** That rule is the whole router: `/me` and `/n8ncation/<slug>` have no files of their own. `vite` and `vite preview` already behave this way.
3. **The site's origin is an authorized JavaScript origin** on the Google OAuth client, and the n8n OAuth workflow redirects back to that origin (see [Auth setup checklist](#auth-setup-checklist)).

### GitHub Pages

`.github/workflows/deploy-pages.yml` builds and deploys the site with GitHub Actions when the default branch is updated. It also publishes `dist/index.html` as `dist/404.html` so GitHub Pages can load the app shell for deep links. Those responses still have HTTP status 404.

To enable deployment:

1. Push this workflow to the repository's default branch.
2. In **Settings → Pages**, set the build and deployment source to **GitHub Actions**.
3. Add the build-time values under **Settings → Secrets and variables → Actions → Variables**:
   - `VITE_API_BASE`
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_OAUTH_REDIRECT`
4. Add the GitHub Pages origin to the Google OAuth client's authorized JavaScript origins, and configure the n8n OAuth workflow to redirect back to the deployed site.

These Vite variables are included in the browser bundle; do not put secrets in them. The Google client ID and endpoint URLs are public configuration, not credentials.

The workflow can publish a repository project site at `https://<owner>.github.io/<repository>/`, but the app currently assumes it is hosted at the domain root: its assets and links are root-relative, and its route matching does not remove a repository prefix. Therefore, the initial project-site deployment will need a separate path-prefix change before the app works there. A custom domain serving the app at `/` avoids that change.

---

## Frontend

```
index.html              All views' markup, <template>s, and the inline view picker
public/                 Static assets copied as-is (official n8n logo + symbol)
src/
  main.ts               Boot: handles the sign-in return, renders the auth chip, mounts the current view
  auth.ts               Google sign-in (popup + redirect fallback), session storage, JWT decoding for display
  dom.ts                template() / requireEl() helpers
  api/
    client.ts           The only module that talks to n8n; falls through to mock.ts when VITE_API_BASE is empty
    types.ts            The API contract (request/response shapes, ApiError)
    mock.ts             In-memory implementation of the same contract
  data/
    polls.ts            Poll definitions (question, single/multi, seed options, suggestions on/off)
  features/
    workations.ts       Trip cards on home, the trip detail page + RSVP, the "your trips" list on /me
    polls.ts            Poll cards, voting, free-text suggestions
    profile.ts          The /me profile card (team, job title)
  styles/
    tokens.css          Brand primitives + Light mode semantic tokens from n8ndesign.md
    styles.css          Component styles, using the tokens only
```

**Views.** There are three, all served by `index.html`:

| Path                | View     | What it shows                                           |
| ------------------- | -------- | ------------------------------------------------------- |
| `/`                 | `home`   | Upcoming and past trips, "What to expect", the polls    |
| `/n8ncation/<slug>` | `detail` | One trip with the RSVP button                           |
| `/me`               | `me`     | Your profile (editable team + job title) and your trips |

A small inline script in `<head>` sets `<html data-view="…">` before first paint. CSS hides every element whose `data-only` doesn't match the view, and `main.ts` reads `data-view` to decide what to mount. Elements are found through `data-*` hooks, and repeated items (trip cards, poll cards, options, rows) are cloned from `<template>`s.

**Conventions worth keeping:**

- Feature modules don't import each other. Shared data goes through `main.ts`, which on `/me` loads `GET /me` and `GET /workations` once and passes them to both `profile.ts` and `workations.ts`.
- Every network call goes through `src/api/client.ts`. Each function there has a matching function in `mock.ts`, and both are typed by `types.ts`.
- Writes (votes, suggestions, RSVPs, profile saves) are optimistic. The UI updates right away, rolls back if the request fails, and locks the control while the request is in flight. The lock matters because Data Table upserts aren't atomic (see [Scaling](#scaling-to-500-users)).
- All server and user content is inserted with `textContent`, never `innerHTML`.
- Upcoming vs. past is computed from `endDate` against the reader's local date. There's no status column to keep in sync.

---

## Authentication

Sign-in uses Google OAuth 2.0 (authorization code flow), with an n8n workflow as the confidential client. The OAuth client is an **Internal** app in the n8n Google Workspace, so only n8n accounts can sign in. The `hd=n8n.io` parameter sent by the frontend only narrows the account picker; it isn't a security check.

**Flow:**

1. The user clicks **Sign in**. `auth.ts` opens a popup and POSTs a hidden form to `https://accounts.google.com/o/oauth2/v2/auth` with `response_type=code`, `scope=openid email profile`, `access_type=online`, `hd=n8n.io` and a random `state`. The state is prefixed `p.` (popup) or `r.` (popup blocked, so the current window navigates instead) and saved in `sessionStorage`.
2. Google redirects to the **"Google OAuth Login"** workflow's webhook, `GET /n8ncations/callback`, with `code` and `state`.
3. The workflow:
   1. exchanges the code at `https://oauth2.googleapis.com/token` (HTTP Request node "request access_token", which holds the client ID and secret)
   2. decodes the identity claims from the returned `id_token`
   3. upserts the user into the `profiles` table (matched on `user_sub`), refreshing `email`, `name` and `picture` on every sign-in
   4. signs a session JWT (JWT node, `jwtAuth` credential) with claims `sub`, `email`, `name`, `picture`, `iat` and `exp` (**30 days**)
   5. redirects to `<site-origin>/#session=<jwt>&state=<state>`
4. Back on the site, the popup passes the fragment to its opener with `postMessage` (same origin only) and closes. The opener checks `state` against `sessionStorage` (CSRF protection), checks `exp`, and stores the JWT in `localStorage` under `n8ncation.session.v1`. The redirect fallback does the same checks on page load and then returns to the page where sign-in started.
5. Private API calls send `Authorization: Bearer <jwt>`. Each private webhook uses **JWT Auth** with the same `jwtAuth` credential, and the workflows take the user's identity only from `jwtPayload.sub`.

The frontend decodes the JWT only to show the name and avatar. It never verifies it; n8n does. Signing out just deletes the stored token.

### Auth setup checklist

When moving to a new Google client, n8n instance or site URL:

- **Google Cloud Console → OAuth client (Web application, Internal):**
  - Authorized JavaScript origins: `http://localhost:5173` and the production site origin.
  - Authorized redirect URI: the callback webhook URL, exactly as in `VITE_OAUTH_REDIRECT`.
- **n8n "Google OAuth Login" workflow:**
  - "request access_token" node: `client_id`, `client_secret` and `redirect_uri`. The `redirect_uri` must be the same callback URL.
  - "Success" node: the redirect URL must start with the site origin the user should return to.
- **n8n `jwtAuth` credential (HS256 secret):** the JWT node and every private webhook must use the same credential. Rotating the secret signs everyone out.
- **Frontend:** `VITE_GOOGLE_CLIENT_ID` and `VITE_OAUTH_REDIRECT`, then rebuild.

---

## Backend API

All routes live in the **"API endpoints"** workflow. Each one is a Webhook node (Respond: _Using 'Respond to Webhook' node_) followed by Data Table and Code nodes. URLs are `${VITE_API_BASE}/<path>`.

| Method | Path           | Auth | Request body                                         | Response                                                                                              | Tables                                         |
| ------ | -------------- | ---- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| GET    | `/workations`  | —    | —                                                    | `200 { workations: Workation[] }`                                                                     | `workations`, `signups`, `profiles` (read)     |
| GET    | `/polls`       | —    | —                                                    | `200 { polls: [{ pollId, voters, options: [{ value, count, suggested }] }] }`                         | `votes`, `poll_options` (read)                 |
| GET    | `/me`          | JWT  | —                                                    | `200 { sub, name, email, picture, team, jobTitle, votes: { [pollId]: string[] }, signups: string[] }` | `profiles`, `signups`, `votes` (read)          |
| POST   | `/me`          | JWT  | `{ team: string \| null, jobTitle: string \| null }` | no body                                                                                               | `profiles` (update)                            |
| POST   | `/rsvp`        | JWT  | `{ workationId: string, attending: boolean }`        | `200` on sign-up, `204` on cancel                                                                     | `workations` (read), `signups` (upsert/delete) |
| POST   | `/vote`        | JWT  | `{ pollId: string, options: string[] }`              | `201`, no body                                                                                        | `poll_options` (read), `votes` (upsert)        |
| POST   | `/poll-option` | JWT  | `{ pollId: string, value: string }`                  | `201` added, `200` already existed, no body                                                           | `poll_options` (read/insert)                   |

`Workation` = `{ workationId, slug, title, place, startDate, endDate, description, imageUrl, imageAlt, attendees, organizer: { name, … } | null }`. The full contract is in `src/api/types.ts`.

**Behavior per route:**

- **`GET /workations`** joins each trip with its signup count (distinct `user_sub`s) and resolves `organizer` against `profiles`. It's public, so it returns counts only, never who signed up. Dates are truncated to `YYYY-MM-DD`. The frontend uses this one list for the home page, the detail page (matched by `slug`) and `/me`.
- **`GET /polls`** keeps only the newest vote row per (poll, user) by `updatedAt`, in case a race created duplicates. `voters` counts people with at least one selection. `suggested` is true for any option not seeded (`created_by_sub !== "seed"`).
- **`GET /me` / `POST /me`** share one webhook with _Allow Multiple HTTP Methods_. GET reads the caller's profile, signups and votes. POST updates only `team` and `jobTitle`; name, email and picture are rewritten from Google on every sign-in.
- **`POST /rsvp`** checks that the trip exists and that today is before its `end_date`. Then it upserts a `signups` row (`attending: true`) or deletes it (`attending: false`).
- **`POST /vote`** sends the **whole selection** for one poll, not a single toggle. Values not in `poll_options` for that poll are dropped, and the result is upserted as one row per (poll, user). An empty array clears the vote.
- **`POST /poll-option`** collapses whitespace, caps the value at 40 characters, and stores a lowercase `value_key` for duplicate checks.

**Errors.** `client.ts` turns any non-2xx response into an `ApiError`. A 401 or 403 is shown as "session expired, sign in again". Otherwise a JSON body's `message` is shown when present. Network and CORS failures appear as "Could not reach the server". Empty 200/201/204 responses are accepted for writes.

---

## Data Tables

Five n8n Data Tables. Every table also has the system columns `id`, `createdAt` and `updatedAt`. There are no unique constraints, so the "one row per …" rules below are enforced by the workflows' upserts. `user_sub` is always the Google account's `sub` claim.

### `workations`: one row per trip (edited by hand)

| Column         | Type   | Notes                                                                                                                                         |
| -------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `workation_id` | string | Stable join key, zero-padded edition number: `"01"`, `"02"`                                                                                   |
| `slug`         | string | URL segment, `/n8ncation/<slug>`. Must be unique, e.g. `roche-2026`                                                                           |
| `title`        | string | e.g. `n8ncation #01`                                                                                                                          |
| `place`        | string | e.g. `Roche, Spain`                                                                                                                           |
| `start_date`   | date   | `YYYY-MM-DD`. A Date or a String column both work (truncated to the day)                                                                      |
| `end_date`     | date   | `YYYY-MM-DD`. Decides upcoming vs. past, and closes RSVPs after this day                                                                      |
| `description`  | string | Plain text                                                                                                                                    |
| `image_url`    | string | Absolute URL (or a root-relative path to a file in `public/`). Empty hides the photo                                                          |
| `image_alt`    | string | Alt text for the photo                                                                                                                        |
| `organizer`    | string | `user_sub` of the organizer → `profiles.user_sub`. Empty hides the "Organized by" line. Only shown if that person has signed in at least once |

### `signups`: one row per (trip, person)

| Column         | Type   | Notes                       |
| -------------- | ------ | --------------------------- |
| `workation_id` | string | → `workations.workation_id` |
| `user_sub`     | string | → `profiles.user_sub`       |

### `profiles`: one row per person who has signed in

| Column     | Type   | Notes                                                                |
| ---------- | ------ | -------------------------------------------------------------------- |
| `user_sub` | string | Google `sub`, the identity key used everywhere                       |
| `email`    | string | From Google, refreshed on every sign-in                              |
| `name`     | string | From Google (given + family name), refreshed on sign-in              |
| `picture`  | string | Google avatar URL, refreshed on sign-in                              |
| `team`     | string | Editable on `/me`. Null when unset; the frontend caps it at 60 chars |
| `jobTitle` | string | Editable on `/me`. Same rules as `team`                              |

### `votes`: one row per (poll, person)

| Column     | Type   | Notes                                                              |
| ---------- | ------ | ------------------------------------------------------------------ |
| `poll_id`  | string | Matches a poll `id` in `src/data/polls.ts` (`month`, `location`)   |
| `user_sub` | string | → `profiles.user_sub`                                              |
| `options`  | string | **JSON-encoded array** of selected values, e.g. `["April","June"]` |

### `poll_options`: one row per option of a poll

| Column           | Type   | Notes                                                             |
| ---------------- | ------ | ----------------------------------------------------------------- |
| `poll_id`        | string | Matches a poll `id` in `src/data/polls.ts`                        |
| `value`          | string | Display label and the value stored in `votes.options`             |
| `value_key`      | string | Lowercased `value`, used for duplicate checks                     |
| `created_by_sub` | string | `seed` for built-in options, otherwise the suggester's `user_sub` |

Seeded today: the twelve months for `month`, and Finland, Portugal and Ireland for `location`.

```
profiles.user_sub ◀── signups.user_sub
                  ◀── votes.user_sub
                  ◀── poll_options.created_by_sub (unless "seed")
                  ◀── workations.organizer
workations.workation_id ◀── signups.workation_id
poll_options.poll_id = votes.poll_id = src/data/polls.ts id
```

---

## Mock mode

When `VITE_API_BASE` is empty, `client.ts` routes every call to `src/api/mock.ts`:

- In-memory seed data: two trips (one upcoming, one past), some votes and signups, and one suggested location.
- **Sign in (demo)** creates a local, **unsigned** session for "Demo Colleague". n8n would reject this token; it exists only to drive the mock.
- Every call waits about 260 ms to simulate the network. All state resets on reload, and a banner says so.

Use mock mode to build or review UI without touching real data. When the API contract changes, update `mock.ts` together with `types.ts` and `client.ts`.

---

## Managing content

- **Add a trip:** add a row to the `workations` Data Table (columns above). It appears on the home page right away and gets its own page at `/n8ncation/<slug>`. Once `end_date` has passed, it moves to "Past n8ncations" and the RSVP button disappears.
- **Seed a poll option:** add a `poll_options` row with `created_by_sub = seed`. Also add it to `seedOptions` in `src/data/polls.ts` if it should show before results load.
- **Remove a poll option:** delete its `poll_options` row. Existing votes for it are ignored in the counts.

---

## Extending

**Add a poll**

1. Add a `PollConfig` to `POLLS` in `src/data/polls.ts` (`id`, question, `mode: "single" | "multi"`, seed options, `allowSuggestions`).
2. Add its seed rows to `poll_options` with the same `poll_id`.
3. In the "API endpoints" workflow, update the **"Aggregate Votes"** Code node on the `GET /me` branch. It currently maps only `month` and `location` into `votes`.
4. Optionally seed votes for it in `mock.ts`.

`GET /polls` and `POST /vote` are generic over `poll_id` and need no changes.

**Add an API endpoint**

1. In n8n: add a Webhook node (with JWT Auth and the `jwtAuth` credential if it's private) and a Respond to Webhook node. Take identity from `jwtPayload.sub`, never from the body. n8n allows one webhook per path and method; use _Allow Multiple HTTP Methods_ to share a path.
2. Add the request/response types to `src/api/types.ts`.
3. Add a function to `src/api/client.ts`, using `request(path, init, authenticated)`.
4. Add the matching function to `src/api/mock.ts`.

**Add a page/view**

1. Extend the inline view picker in `index.html` with the new path.
2. Add the markup with `data-only="<view>"` and `data-*` hooks (and any `<template>`s).
3. Put the logic in a new `src/features/<name>.ts` and add a branch for the view in `boot()` in `src/main.ts`. If it depends on who is signed in, hook it into `onAuthChange()`.

**Add a profile field**

Add the column to `profiles`, then update the `POST /me` "Update row(s)" node and the `GET /me` "Format Response" node, `Me`/`ProfileUpdate` in `types.ts`, the form in `index.html`, `src/features/profile.ts`, and `mock.ts`.

**Design.** Any new UI follows [`n8ndesign.md`](n8ndesign.md) and uses the tokens in `src/styles/tokens.css`. Don't add raw colors, sizes or a hand-drawn logo.

---

## Scaling to 500 users

The frontend is static, so it isn't the bottleneck. Data volume stays small at 500 users: about 500 `profiles` rows, up to about 1,000 `votes` rows (two polls), and a few hundred `signups` per trip. The limit is **n8n executions**, because every API call is one workflow execution.

**Load per page view:** home makes 2 calls (`/workations`, `/polls`), plus `/me` when signed in. The detail page and `/me` make 2 each. Each vote or RSVP adds one write. A launch announcement to all 500 people could mean around 1,500 executions within minutes.

Things to watch as usage grows, roughly in order:

1. **`GET /polls` query fan-out.** "Get options" runs once per vote row (it's fed by "Get votes"), so the number of Data Table queries grows with the number of votes. Fetch `poll_options` once instead, for example as a parallel branch merged before the Code node.
2. **`GET /workations` reads all of `profiles`** on every public call just to resolve organizer names. Filter to the organizer subs, or store the organizer's display name on the trip.
3. **Concurrency.** Webhook executions queue under the instance's concurrency limit, so a burst slows every endpoint, including sign-in. Options:
   - cache the two public GETs (they change rarely)
   - combine `GET /workations` and `GET /polls` into one call for the home page
   - move the API to its own instance or queue-mode workers
4. **Non-atomic upserts.** A Data Table upsert is "update, else insert" with no unique index, so two overlapping writes for the same person can both insert. The frontend locks the control during a write, and `GET /polls` keeps only the newest row per person. Any new write endpoint needs the same care.
5. **Execution history.** Both workflows save every successful execution. At this volume, save only failed executions to keep storage and the executions list manageable.
6. **Sessions.** JWTs last 30 days and can't be revoked one by one. Rotating the `jwtAuth` secret signs everyone out. Shorten `exp` in the JWT node if that's too long.
7. **CORS.** The webhooks use n8n's default CORS settings. Setting _Allowed Origins_ to the site origin limits browser access to the site.
