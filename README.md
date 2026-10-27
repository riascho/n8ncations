# n8ncations

An internal site for planning n8n team workations. Colleagues sign in with their n8n Google account to:

- browse upcoming and past n8ncations
- RSVP to an upcoming trip, or join its waitlist when it's full (the next person moves up automatically when someone cancels)
- share private trip logistics (dietary needs, room preference, travel times, emergency contact) that only the trip's organizer sees
- see everyone's logistics on a trip they organize
- pitch a trip of their own, and register interest in other pitches; a pitch with enough interest by its deadline becomes an n8ncation
- edit or cancel a pitch they submitted, giving a reason that everyone sees on the pitch until its deadline
- vote on which months and locations work for the next one, and suggest new locations
- keep a small profile (team, job title) and see the trips they signed up for

The UI follows the post-rebrand n8n design system described in [`n8ndesign.md`](n8ndesign.md). Its tokens are implemented in `src/styles/tokens.css`.

---

## Architecture

```
┌──────────────────────────┐   fetch (JSON)    ┌──────────────────────────┐        ┌──────────────────┐
│ Static site              │ ────────────────▶ │ n8n workflow             │ ─────▶ │ n8n Data Tables  │
│ Vite + TypeScript,       │  Bearer <JWT> on  │ one per route: "/me",    │        │ workations,      │
│ no framework             │  every route      │ "/rsvp", "/polls", …     │        │ signups, votes,  │
└────────────┬─────────────┘                   └──────────────────────────┘        │ poll_options,    │
             │ sign-in (popup)                 ┌──────────────────────────┐        │ profiles,        │
             ▼                                 │ n8n workflow             │ ─────▶ │ logistics,       │
      Google OAuth 2.0 ──── auth code ───────▶ │ "Google OAuth Login"     │        │ pitches,         │
                                               │ issues the session JWT   │        │ pitch_interest   │
                                               └──────────────────────────┘        └──────────────────┘
                                               ┌──────────────────────────┐                 ▲
                                               │ n8n workflow             │ ────────────────┘
                                               │ "Pitch decisions"        │
                                               │ (Schedule, daily)        │
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

1. **It serves from the domain root or its configured base path.** Set Vite's `base` to the deployment path when serving from a sub-path.
2. **Unknown paths fall back to `index.html` with status 200.** That rule is the whole router: `/me` and `/n8ncation/<slug>` have no files of their own. `vite` and `vite preview` already behave this way.
3. **The site's origin is an authorized JavaScript origin** on the Google OAuth client, and the n8n OAuth workflow redirects back to that origin (see [Auth setup checklist](#auth-setup-checklist)).

### GitHub Pages

`.github/workflows/deploy-pages.yml` builds and deploys the site with GitHub Actions when the default branch is updated. It reads the Pages base path from `configure-pages`, so the same build works at a repository URL or a custom domain. It also publishes `dist/index.html` as `dist/404.html` so GitHub Pages can load the app shell for deep links. Those responses still have HTTP status 404.

To enable deployment:

1. Push this workflow to the repository's default branch.
2. In **Settings → Pages**, set the build and deployment source to **GitHub Actions**.
3. Add the build-time values under **Settings → Secrets and variables → Actions → Variables**:
   - `VITE_API_BASE`
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_OAUTH_REDIRECT`
4. Add the GitHub Pages origin to the Google OAuth client's authorized JavaScript origins, and configure the n8n OAuth workflow to redirect back to the deployed site.

These Vite variables are included in the browser bundle; do not put secrets in them. The Google client ID and endpoint URLs are public configuration, not credentials.

The workflow supports a repository project site at `https://<owner>.github.io/<repository>/` as well as a custom domain. App links, assets, and route matching use the configured base path. Live OAuth also requires updating the Google authorized JavaScript origin and the n8n workflow's redirect destination to match the deployed site URL.

---

## Frontend

```
index.html              All views' markup, <template>s, and the inline view picker
public/                 Static assets copied as-is (official n8n logo + symbol)
src/
  main.ts               Boot: handles the sign-in return, sets data-session, renders the auth chip and banner, mounts the current view once signed in
  auth.ts               Google sign-in (popup + redirect fallback), session storage, JWT decoding for display
  dates.ts              Date parsing and display shared by trips, pitches and logistics
  dom.ts                template() / requireEl() helpers
  paths.ts              Base-path-aware app and asset URLs
  api/
    client.ts           The only module that talks to n8n; falls through to mock.ts when VITE_API_BASE is empty
    types.ts            The API contract (request/response shapes, ApiError)
    mock.ts             In-memory implementation of the same contract
  data/
    polls.ts            Poll definitions (question, single/multi, seed options, suggestions on/off)
  features/
    workations.ts       Trip cards on home, the trip detail page + RSVP and waitlist, the "your trips" list on /me
    logistics.ts        On the trip page: your private logistics form, and the organizer's attendee list
    pitches.ts          Pitch cards + interest on home, the organizer's cancel, "your pitches" on /me, and the /pitch form (new or edit)
    polls.ts            Poll cards, voting, free-text suggestions
    profile.ts          The /me profile card (team, job title)
  styles/
    tokens.css          Brand primitives + Light mode semantic tokens from n8ndesign.md
    styles.css          Component styles, using the tokens only
```

**Views.** There are four, all served by `index.html`:

| Path                | View     | What it shows when signed in                                                                                                             |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                 | `home`   | Upcoming and past trips, "What to expect", the polls, open pitches (and cancelled ones until their deadline)                             |
| `/n8ncation/<slug>` | `detail` | One trip with the RSVP button, your logistics form once you've signed up, and the attendee list if you organize it                       |
| `/me`               | `me`     | Your profile (editable team + job title), your trips including waitlisted ones, and your pitches, each open one linking to its edit form |
| `/pitch`            | `pitch`  | The form to pitch a trip. With `?edit=<pitchId>`, the same form filled in, for that pitch's organizer only                               |

A small inline script in `<head>` sets `<html data-view="…">` before first paint. CSS hides every element whose `data-only` doesn't match the view, and `main.ts` reads `data-view` to decide what to mount. In the same way, `main.ts` sets `<html data-session="signed-in|signed-out">` at boot: elements marked `data-private` only show signed in, and elements marked `data-signed-out` (the banner) only show signed out. Before that runs, neither shows. Elements are found through `data-*` hooks, and repeated items (trip cards, poll cards, options, rows) are cloned from `<template>`s.

**Conventions worth keeping:**

- Feature modules don't import each other. Shared data goes through `main.ts`, which on `/me` loads `GET /me` and `GET /workations` once and passes them to both `profile.ts` and `workations.ts`. It loads `GET /pitches` for the same page separately and passes it to `pitches.ts` for "your pitches". On the trip page, `workations.ts` reports the reader's RSVP state through a callback, and `main.ts` hands it to `logistics.ts`. Helpers more than one feature needs live outside `src/features` (`dates.ts`, `dom.ts`).
- Every network call goes through `src/api/client.ts`. Each function there has a matching function in `mock.ts`, and both are typed by `types.ts`.
- Everything except the intro, "What to expect" and the sign-in banner is private: the markup carries `data-private`, and it's only mounted from `mountView()` in `main.ts` once someone is signed in. Being signed in only means a token is stored, and the browser never verifies it, so each view also stays hidden until its first authenticated API call succeeds. `/pitch` loads no data, so it calls `GET /me` just for that check. In edit mode it loads `GET /pitches` instead, which is the check too. A demo token left over from mock mode is dropped as soon as `VITE_API_BASE` is set.
- Writes (votes, suggestions, RSVPs, pitch interest, cancelling a pitch, profile and logistics saves) are optimistic, except creating or editing a pitch, which has nothing on its page to update.
- Edit and cancel controls only show on pitches with `organizedByMe`, but that's a convenience. The real check is in the `/pitch-update` and `/pitch-cancel` workflows, which compare the pitch's `organizer` with `jwtPayload.sub` and answer 404 to anyone else. The UI updates right away, rolls back if the request fails, and locks the control while the request is in flight. The lock matters because Data Table upserts aren't atomic (see [Scaling](#scaling-to-500-users)).
- All server and user content is inserted with `textContent`, never `innerHTML`.
- Upcoming vs. past is computed from `endDate` against the reader's local date. There's no status column to keep in sync.

---

## Authentication

Sign-in uses Google OAuth 2.0 (authorization code flow), with an n8n workflow as the confidential client. The OAuth client is an **Internal** app in the n8n Google Workspace, so only n8n accounts can sign in. The `hd=n8n.io` parameter sent by the frontend only narrows the account picker; it isn't a security check.

**Flow:**

1. The user clicks **Sign in**. `auth.ts` opens a popup and POSTs a hidden form to `https://accounts.google.com/o/oauth2/v2/auth` with `response_type=code`, `scope=openid email profile`, `access_type=online`, `hd=n8n.io` and a random `state`. The state is prefixed `p.` (popup) or `r.` (popup blocked, so the current window navigates instead) and saved in `sessionStorage`.
2. Google redirects to the **"Google OAuth Login"** workflow's webhook, `GET /n8ncations/callback`, with `code` and `state`.
3. The workflow:
   1. exchanges the code at `https://oauth2.googleapis.com/token` (HTTP Request node "request access_token", which sends the client ID and secret as HTTP Basic auth from the "Google Client" credential)
   2. decodes the identity claims from the returned `id_token`
   3. upserts the user into the `profiles` table (matched on `user_sub`), refreshing `email`, `name` and `picture` on every sign-in
   4. signs a session JWT (JWT node, `jwtAuth` credential) with claims `sub`, `email`, `name`, `picture`, `iat` and `exp` (**30 days**)
   5. redirects to `<site-origin>/#session=<jwt>&state=<state>`
4. Back on the site, the popup passes the fragment to its opener with `postMessage` (same origin only) and closes. The opener checks `state` against `sessionStorage` (CSRF protection), checks `exp`, and stores the JWT in `localStorage` under `n8ncation.session.v1`. The redirect fallback does the same checks on page load and then returns to the page where sign-in started.
5. Every API call sends `Authorization: Bearer <jwt>`. Every API webhook uses **JWT Auth** with the same `jwtAuth` credential, and the workflows take the user's identity only from `jwtPayload.sub`.

The frontend decodes the JWT only to show the name and avatar. It never verifies it; n8n does. Signing out just deletes the stored token.

### Auth setup checklist

When moving to a new Google client, n8n instance or site URL:

- **Google Cloud Console → OAuth client (Web application, Internal):**
  - Authorized JavaScript origins: `http://localhost:5173` and the production site origin.
  - Authorized redirect URI: the callback webhook URL, exactly as in `VITE_OAUTH_REDIRECT`.
- **n8n "Google OAuth Login" workflow** (details in [`.n8n/README.md`](.n8n/README.md)):
  - "Google Client" credential (HTTP Basic Auth): the OAuth client ID as user, the client secret as password. "request access_token" uses it.
  - Instance variable `SITE_URL` (the site origin, no trailing slash). The "Success" and "Failure" nodes redirect to it.
  - "request access_token" node: `redirect_uri` must be the same callback URL.
- **n8n `jwtAuth` credential (HS256 secret):** the JWT node and every API webhook must use the same credential. Rotating the secret signs everyone out.
- **Frontend:** `VITE_GOOGLE_CLIENT_ID` and `VITE_OAUTH_REDIRECT`, then rebuild.

---

## Backend API

Each route is its own n8n workflow, named after its path (`/workations`, `/me`, …): a Webhook node (Respond: _Using 'Respond to Webhook' node_) followed by Data Table and Code nodes. URLs are `${VITE_API_BASE}/<path>`. The table below is the contract the frontend relies on. Everything about the workflows themselves is in [`.n8n/`](.n8n/README.md): how each route behaves, the Data Tables, the scheduled "Pitch decisions" workflow, importable blueprints for every workflow, and [`DISCREPANCIES.md`](.n8n/DISCREPANCIES.md) for where the live instance differs from this contract.

| Method | Path              | Auth | Request body                                                                     | Response                                                                                                                                                           | Tables                                                                      |
| ------ | ----------------- | ---- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| GET    | `/workations`     | JWT  | —                                                                                | `200 { workations: Workation[] }`                                                                                                                                  | `workations`, `signups`, `profiles` (read)                                  |
| GET    | `/polls`          | JWT  | —                                                                                | `200 { polls: [{ pollId, voters, options: [{ value, count, suggested }] }] }`                                                                                      | `votes`, `poll_options` (read)                                              |
| GET    | `/me`             | JWT  | —                                                                                | `200 { sub, name, email, picture, team, jobTitle, votes: { [pollId]: string[] }, signups: string[], waitlist: [{ workationId, position }], organizing: string[] }` | `profiles`, `signups`, `votes`, `workations` (read)                         |
| POST   | `/me`             | JWT  | `{ team: string \| null, jobTitle: string \| null }`                             | no body                                                                                                                                                            | `profiles` (update)                                                         |
| POST   | `/rsvp`           | JWT  | `{ workationId: string, attending: boolean }`                                    | `200 { status: "going" \| "waitlist", position: number \| null }` on sign-up, `204` on cancel                                                                      | `workations` (read), `signups` (upsert/delete/update), `logistics` (delete) |
| GET    | `/logistics`      | JWT  | query `?workationId=`                                                            | `200 { mine: Logistics \| null }`                                                                                                                                  | `logistics` (read)                                                          |
| POST   | `/logistics`      | JWT  | `{ workationId, dietary, roomPreference, arrival, departure, emergencyContact }` | no body                                                                                                                                                            | `signups` (read), `logistics` (upsert)                                      |
| GET    | `/roster`         | JWT  | query `?workationId=`                                                            | `200 { people: RosterEntry[] }`, `404` unless you organize the trip                                                                                                | `workations`, `signups`, `profiles`, `logistics` (read)                     |
| GET    | `/pitches`        | JWT  | —                                                                                | `200 { pitches: Pitch[] }`, open pitches plus cancelled ones until their deadline                                                                                  | `pitches`, `pitch_interest`, `profiles` (read)                              |
| POST   | `/pitch`          | JWT  | `NewPitch` (see below)                                                           | `201 { pitchId }`, `400 { message }` when invalid                                                                                                                  | `pitches` (insert), `pitch_interest` (insert)                               |
| POST   | `/pitch-update`   | JWT  | `PitchUpdate` = `NewPitch` + `pitchId`                                           | `200`, no body. `400 { message }` when invalid or closed, `404` unless you organize the pitch                                                                      | `pitches` (read/update)                                                     |
| POST   | `/pitch-cancel`   | JWT  | `{ pitchId: string, reason: string }`                                            | `200`, no body. `400 { message }` when the reason is empty or the pitch is closed, `404` unless you organize the pitch                                             | `pitches` (read/update)                                                     |
| POST   | `/pitch-interest` | JWT  | `{ pitchId: string, interested: boolean }`                                       | `200` added, `204` removed, no body                                                                                                                                | `pitches` (read), `pitch_interest` (upsert/delete)                          |
| POST   | `/vote`           | JWT  | `{ pollId: string, options: string[] }`                                          | `201`, no body                                                                                                                                                     | `poll_options` (read), `votes` (upsert)                                     |
| POST   | `/poll-option`    | JWT  | `{ pollId: string, value: string }`                                              | `201` added, `200` already existed, no body                                                                                                                        | `poll_options` (read/insert)                                                |

`Workation` = `{ workationId, slug, title, place, startDate, endDate, description, imageUrl, imageAlt, attendees, capacity: number | null, waitlisted, organizer: { name, … } | null }`.
`Logistics` = `{ dietary, roomPreference, arrival, departure, emergencyContact }`, every field `string | null`. `arrival` and `departure` are `YYYY-MM-DDTHH:MM` in destination time.
`RosterEntry` = `{ name, email, team, status: "going" | "waitlist", position: number | null, logistics: Logistics | null }`.
`Pitch` = `{ pitchId, status: "open" | "cancelled", cancelReason, place, startDate, endDate, description, accommodationUrl, capacity, threshold, deadline, costEstimate: number | null, costIncludes, interested, interestedByMe, organizedByMe, organizer: { name } | null }`. `cancelReason` is `""` unless cancelled.
`NewPitch` = `{ place, startDate, endDate, description, accommodationUrl: string | null, capacity, threshold, deadline, costEstimate: number | null, costIncludes: string | null }`.
The full contract is in `src/api/types.ts`.

**Errors.** `client.ts` turns any non-2xx response into an `ApiError`. A 401 or 403 is shown as "session expired, sign in again". Otherwise a JSON body's `message` is shown when present. Network and CORS failures appear as "Could not reach the server". Empty 200/201/204 responses are accepted for writes.

---

## Mock mode

When `VITE_API_BASE` is empty, `client.ts` routes every call to `src/api/mock.ts`:

- In-memory seed data: three trips, some votes and signups, one suggested location, three open pitches and some logistics. Roche (upcoming) has one spot left and is organized by the demo user, so it shows the attendee list. Lapland (upcoming) is full, so signing up joins the waitlist. Lisbon is past. The demo user pitched Lake Bled, so its card has the edit and cancel controls, and it is listed under "Your pitches" on `/me`.
- Nothing confirms or expires pitches in mock mode, since that's the scheduled workflow's job. Pages are separate documents, so a pitch submitted or edited on `/pitch` is back to its seed state by the time home loads. Cancelling happens on home, so it stays visible until you reload.
- **Sign in (demo)** creates a local, **unsigned** session for "Demo Colleague". n8n would reject this token; it exists only to drive the mock.
- Every call waits about 260 ms to simulate the network. All state resets on reload, and a banner says so.

Use mock mode to build or review UI without touching real data. When the API contract changes, update `mock.ts` together with `types.ts` and `client.ts`.

---

## Managing content

- **Add a trip:** add a row to the `workations` Data Table (columns above), or let a pitch become one. It appears on the home page right away and gets its own page at `/n8ncation/<slug>`. Once `end_date` has passed, it moves to "Past n8ncations" and the RSVP button disappears.
- **Change a trip's capacity:** edit `capacity`. Raising it doesn't move anyone off the waitlist by itself; set the oldest waitlist rows to `going` by hand.
- **Withdraw a pitch:** its organizer can cancel it from its card on home, with a reason. To remove one by hand without a reason showing, set its `status` to `expired`.
- **Seed a poll option:** add a `poll_options` row with `created_by_sub = seed`. Also add it to `seedOptions` in `src/data/polls.ts` if it should show before results load.
- **Remove a poll option:** delete its `poll_options` row. Existing votes for it are ignored in the counts.

---

## Extending & Scaling

**Add a poll**

1. Add a `PollConfig` to `POLLS` in `src/data/polls.ts` (`id`, question, `mode: "single" | "multi"`, seed options, `allowSuggestions`).
2. Add its seed rows to `poll_options` with the same `poll_id`.
3. Optionally seed votes for it in `mock.ts`.

`GET /polls`, `POST /vote` and the `/me` blueprint in `.n8n/workflows/me.json` are generic over `poll_id` and need no changes. The live `/me` workflow isn't yet: its "Aggregate Votes" node maps only `month` and `location` (see `.n8n/DISCREPANCIES.md`).

**Add an API endpoint**

1. In n8n: add a workflow named after the path, with a Webhook node (with JWT Auth and the `jwtAuth` credential; every route is private) and a Respond to Webhook node on every branch. Take identity from `jwtPayload.sub`, never from the body. n8n allows one webhook per path and method; use _Allow Multiple HTTP Methods_ to share a path. Add its blueprint to `.n8n/workflows/` and its behavior to `.n8n/README.md`.
2. Add the request/response types to `src/api/types.ts`.
3. Add a function to `src/api/client.ts`, using `request(path, init, true)`.
4. Add the matching function to `src/api/mock.ts`, starting with `requireUser()`.

**Add a page/view**

1. Extend the inline view picker in `index.html` with the new path.
2. Add the markup with `data-only="<view>"` and `data-*` hooks (and any `<template>`s). Add `data-private` to anything that loads API data.
3. Put the logic in a new `src/features/<name>.ts` and add a branch for the view in `mountView()` in `src/main.ts`. It runs once, after boot or after sign-in, and only when signed in.

**Add a profile field**

Add the column to `profiles`, then update the `/me` workflow (in the blueprint: "Tidy profile update", "Update profile" and "Build me"), `Me`/`ProfileUpdate` in `types.ts`, the form in `index.html`, `src/features/profile.ts`, and `mock.ts`.

**Support other currencies (potential feature)**

All money amounts are in EUR for now. No currency is stored or sent: `cost_estimate` and `costEstimate` are plain numbers, and the frontend assumes euros. To allow other currencies, add a `currency` column (ISO 4217 code, such as `EUR` or `USD`) to `pitches`. Then update the `POST /pitch` validation and insert, the same validation and update in `POST /pitch-update`, and the `GET /pitches` response. Add `currency` to `Pitch`/`NewPitch` in `types.ts`. Update the formatter in `src/features/pitches.ts` (`euros`, hard-coded to `EUR`) and its validation message, the "Cost per person in euros" field in `index.html`, and `mock.ts`.

**Design.** Any new UI follows [`n8ndesign.md`](n8ndesign.md) and uses the tokens in `src/styles/tokens.css`. Don't add raw colors, sizes or a hand-drawn logo.

**Load per page view:** signed out, no view makes any calls. Signed in, home makes 4 calls (`/workations`, `/polls`, `/me`, `/pitches`). The detail page makes 2, plus `/logistics` once you're signed up and `/roster` if you organize the trip. `/me` makes 3 (`/me`, `/workations`, `/pitches`), and `/pitch` makes 1 (`/me`, to verify the session, or `/pitches` when editing). Each vote or RSVP adds one write. A launch announcement to all 500 people could mean around 1,500 executions within minutes.

Things to watch as usage grows, roughly in order:

1. **`GET /polls` query fan-out.** In the live workflow, "Get options" runs once per vote row (it's fed by "Get votes"), so the number of Data Table queries grows with the number of votes. The blueprint in `.n8n/workflows/get-polls.json` reads the options first and the votes once.
2. **`GET /workations` reads all of `profiles`** on every call just to resolve organizer names. Filter to the organizer subs, or store the organizer's display name on the trip.
3. **Concurrency.** Webhook executions queue under the instance's concurrency limit, so a burst slows every endpoint, including sign-in. Options:
   - cache the results of `GET /workations` and `GET /polls` inside the workflow (they change rarely). They need a JWT, so a shared CDN cache in front of them doesn't fit
   - combine `GET /workations` and `GET /polls` into one call for the home page
   - move the API to its own instance or queue-mode workers
4. **Non-atomic upserts.** A Data Table upsert is "update, else insert" with no unique index, so two overlapping writes for the same person can both insert. The frontend locks the control during a write, and `GET /polls` keeps only the newest row per person. Any new write endpoint needs the same care. The same applies to capacity: two people taking the last spot at the same moment can both get `going`. If that matters, run `POST /rsvp` with the workflow's concurrency limited to 1, or recheck the count after inserting and move the newer row to the waitlist.
5. **Execution history.** The workflows save every successful execution. At this volume, save only failed executions to keep storage and the executions list manageable.
6. **Sessions.** JWTs last 30 days and can't be revoked one by one. Rotating the `jwtAuth` secret signs everyone out. Shorten `exp` in the JWT node if that's too long.
7. **CORS.** The webhooks use n8n's default CORS settings. Setting _Allowed Origins_ to the site origin limits browser access to the site.
