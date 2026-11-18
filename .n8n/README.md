# n8n backend

Everything about the n8n side of n8ncations: the workflows, how each route behaves, the Data Tables, and importable blueprints. The frontend's view of the API (the contract in `src/api/types.ts` and the table in the root [README](../README.md#backend-api)) is the source of truth. The workflows have to match it.

- [`workflows/`](workflows): one importable workflow blueprint (`.json`) per workflow

## Instance

| What                           | Value                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Instance                       | `https://n8ncations.app.n8n.cloud`                                                                          |
| Webhook base (`VITE_API_BASE`) | `https://n8ncations.app.n8n.cloud/webhook`                                                                  |
| Project                        | `uAascgo7459L25P4`                                                                                          |
| API workflows folder           | `r2395Of2mvIkdy5V` (every route workflow except the OAuth one, which sits at the project root)              |
| Credential                     | `JWT Auth account` (`jwtAuth`, id `EF3FVWn29g6p0qdG`): verifies every API webhook and signs the session JWT |
| Credential                     | `Google Client` (`httpBasicAuth`, id `OriMkew8RGfonuE5`): the OAuth client ID as user, the secret as password, for the token exchange |
| Credential                     | `n8ncations Bot` (`slackApi`, id `S3g5Ro8gzHcWP7h0`): every Slack node in "Slack Bot Notifier". Type "Slack API" with the app's **Bot User OAuth Token** (`xoxb-…`), so messages come from the bot. An OAuth2 credential would post as whoever connected it. Token rotation off. Scopes: `chat:write`, `im:write`, `users:read`, `users:read.email`. The bot must be a member of the channel |
| Credential                     | `Google Drive` (`googleDriveOAuth2Api`, id `N1Aja1pCQRbh27iB`): every Drive call in "Trip Drive Folders", including the HTTP Request "List permissions". Signed in as the account whose My Drive holds the trip folders, so that account owns every folder. Uses the Drive scope |
| Instance variables             | `SITE_URL` (site origin, no trailing slash), `SLACK_CHANNEL_ID` (the `C…` id of the workations Slack channel), `SLACK_CHANNEL_URL` (`https://<workspace>.slack.com/archives/<id>`, sent to the site by `GET /pitches`), `DRIVE_PARENT_FOLDER_ID` (the Drive folder that holds one folder per trip) |

No secret is stored in this folder. The blueprints refer to credentials by id only.

## Workflows

| Workflow           | Live id            | Route(s)                            | Blueprint                                                        | State on 2026-10-28                 |
| ------------------ | ------------------ | ----------------------------------- | ---------------------------------------------------------------- | ----------------------------------- |
| `/workations`      | `CkVwYcY7FMMZwBAq` | `GET /workations`                   | [`get-workations.json`](workflows/get-workations.json)           | Live. Accommodation and cost fields since 2026-10-28, untested with a real session. `slackUrl` (via "Get pitches") since 2026-10-30, also untested with a real session. `photosUrl` since 2026-11-12, live and published, untested with a real session. `going` and `waitlist` (who signed up) since 2026-11-12, live and published, untested with a real session |
| `/me`              | `9oGsnUIed25uuZ2A` | `GET` + `POST /me`                  | [`me.json`](workflows/me.json)                                   | Live                                |
| `/rsvp`            | `mr9xDlSpcKpYGI3P` | `POST /rsvp`                        | [`rsvp.json`](workflows/rsvp.json)                               | Live. Accommodation and cost fields since 2026-10-28, untested with a real session |
| `/polls`           | `ozitA0kxZ9TeMgey` | `GET /polls`                        | [`get-polls.json`](workflows/get-polls.json)                     | Live                                |
| `/vote`            | `xHEHDmxcWdJ7l8XN` | `POST /vote`                        | [`post-vote.json`](workflows/post-vote.json)                     | Live                                |
| `/poll-option`     | `QUIiRzwKYN5nyRE3` | `POST /poll-option`                 | [`post-poll-option.json`](workflows/post-poll-option.json)       | Live                                |
| Google OAuth Login | `H9fvloDql5H5lJC3` | `GET /n8ncations/callback`          | [`google-oauth-login.json`](workflows/google-oauth-login.json)   | Live                                |
| `/logistics`       | `FqgYFwtC1GBTKhZ6` | `GET` + `POST /logistics`           | [`logistics.json`](workflows/logistics.json)                     | Live. 2026-11-06: `expectations` added, `arrival`/`departure` removed; live and published, untested by a real execution                                |
| `/roster`          | `mcs40fr9gwvYI1VK` | `GET /roster`                       | [`get-roster.json`](workflows/get-roster.json)                   | Live. 2026-11-06: `expectations` added, `arrival`/`departure` removed; live and published, untested by a real execution                                |
| `/trip-photos`     | `KzhMkDkN0XwHh4Kk` | `GET /trip-photos`                  | [`trip-photos.json`](workflows/trip-photos.json)                 | Live and published since 2026-11-12. Dry-run with `test_workflow` (880: the 404 for the first trip before its folder opened; 881: an empty folder answers `{ photos: [] }`). The Drive listing and thumbnail download are untested until a real call after the first trip's folder opens (2026-11-14) |
| `/pitches`         | `FvOIvbAfeAaojR5T` | `GET /pitches`                      | [`get-pitches.json`](workflows/get-pitches.json)                 | Live, with the caller's own closed pitches and photo links since 2026-10-28 (photo links untested with a real session). 2026-10-31: expired pitches listed until their start date, live and published, untested with a real session. `interestedPeople` (who is interested) since 2026-11-12, live and published, untested with a real session |
| `/pitch`           | `oHGIwGKhqy7SwKrr` | `POST /pitch`                       | [`post-pitch.json`](workflows/post-pitch.json)                   | Live. Photo links since 2026-10-28, untested with a real session |
| `/pitch-interest`  | `WtSn1QbHp8kiaeWy` | `POST /pitch-interest`              | [`post-pitch-interest.json`](workflows/post-pitch-interest.json) | Live                                |
| `/pitch-update`    | `fm5TppCp8wmvOmCL` | `POST /pitch-update`                | [`post-pitch-update.json`](workflows/post-pitch-update.json)     | Live since 2026-10-27, not yet exercised with a real session. 2026-10-31: editing reopens an expired pitch, live and published, untested with a real session |
| `/pitch-cancel`    | `0RJ9VKOySLXcyzU0` | `POST /pitch-cancel`                | [`post-pitch-cancel.json`](workflows/post-pitch-cancel.json)     | Live since 2026-10-27, not yet exercised with a real session |
| Date Check & Status Updates    | `mJS4fSDZtZMPgsKx` | Schedule, daily 06:00 instance time | [`date-check-status-updates.json`](workflows/date-check-status-updates.json)         | Live. Copies photo, accommodation and cost since 2026-10-28, not yet run with a confirming pitch |
| Trip Drive Folders | `zbQcYxJXoKYvcwJl` | Schedule, daily 06:30 instance time | [`trip-drive-folders.json`](workflows/trip-drive-folders.json)   | Live and published (tested by hand, 2026-11-09). The first trip's folder exists; its first domain share runs 2026-11-14. 2026-11-15: "Notify Slack" (`photos_folder_created`) after "Save folder", live and published, untested by a real execution |
| Slack Bot Notifier       | `6pNrfjbynQ4IXPM8` | Sub-workflow, called by the routes  | [`slack-notify.json`](workflows/slack-notify.json)               | Live since 2026-10-29. Confirmed by real executions: `pitch_created` (405) and `pitch_cancelled` (419). DMs (interest, RSVP, confirmation) untested. 2026-10-30: the pitch post links to `/pitches/<pitch_id>`, untested by a real execution. 2026-10-31: `pitch_updated` announces a reopened pitch, live and published, untested by a real execution. 2026-11-15: `photos_folder_created` (called by Trip Drive Folders), live and published, untested by a real execution |

**Slack notifications, state on 2026-10-29.** Published: "Slack Bot Notifier", `/pitches` and the five callers (`/pitch`, `/pitch-interest`, `/pitch-cancel`, `/rsvp`, Date Check & Status Updates). "Slack Bot Notifier" was dry-run with `test_workflow` (trigger, Slack nodes and "Save thread" pinned, so nothing was sent or written) for `pitch_created`, `interest_added` and `pitch_confirmed`: the messages and routing were right. Real executions from the site confirmed the channel post with mention and saved thread (405) and the thread reply on cancel (419), both posted as the bot. Interest toggles by the pitch's own organizer (415, 417) correctly sent nothing (no self-notifications); an interest DM still needs a second account to test. `pitch_updated` (added the same day, with `/pitch-update`) was dry-run against a real pitch edit (425); no real edit has run it yet. "Slack Bot Notifier" can't be run from the MCP directly (Execute Workflow Trigger).

### Using the blueprints

The blueprints implement the behavior described below. They use the live Data Table ids, so they import into this instance without remapping.

- **A new workflow:** _Workflows → Import from file_, then activate it.
- **Replacing a live workflow:** open it, select everything on the canvas, delete, then paste the blueprint's JSON onto the canvas and save. This keeps the workflow's id and its webhook URL. Importing as a new workflow instead would register the same path twice, so deactivate the old one first if you go that way.

Check before activating:

- The blueprints have been checked for valid JSON, valid JavaScript in every Code node, and connections that point at existing nodes. They have **not** been run through n8n's validator (it only accepts SDK code) or executed. Open each one, check that no node shows a warning, and test it with the test URL first.
- Every branch ends in a Respond to Webhook node, so no request is left without an answer.
- Every read after the first runs once (_Execute Once_) and keeps going on an empty table (_Always Output Data_). Code nodes skip the empty item that produces.
- Validation happens in a Code node that returns `{ ok, statusCode, body }`, and a Respond node answers with that status and body. Errors are `{ message }` JSON, which the frontend shows as is.
- `$today` is in the instance timezone. Dates are compared with `$today.toFormat('yyyy-MM-dd')`.

### Google OAuth Login

`GET /n8ncations/callback`, no auth (Google calls it). The blueprint's flow:

1. **Has code?** No code (for example, the user cancelled at Google): redirect to **Failure**.
2. **request access_token** exchanges the code at `https://oauth2.googleapis.com/token` and sends the client ID and secret as HTTP Basic auth from the `Google Client` credential (Google accepts either Basic auth or body parameters). The body carries only `code`, `grant_type` and `redirect_uri`. On an error it redirects to **Failure**.
3. **Decode id_token** reads the claims and allows only `hd = n8n.io` with a verified email.
4. **Upsert profile** refreshes `email`, `name` (given + family name) and `picture`, matched on `user_sub`.
5. **JWT** signs `sub`, `email`, `name`, `picture`, `iat`, `exp` (30 days) with the `jwtAuth` credential. The claims are built with `JSON.stringify`, so a quote in a name can't break them.
6. **Success** redirects to `$vars.SITE_URL/#session=<jwt>&state=<state>`; **Failure** to `$vars.SITE_URL/#error=access_denied&state=<state>`.

## Routes

- **`GET /workations`** joins each trip with its signup counts and resolves `organizer` against `profiles`. `attendees` counts `signups` rows with `status = going`, `waitlisted` those with `status = waitlist` (distinct `user_sub`s). `capacity` is the column as is, or null when empty. `accommodationUrl`, `costEstimate` (null when empty) and `costIncludes` come from the columns "Date Check & Status Updates" copies over from the pitch. `slackUrl` is the `slack_url` of the pitch whose `workation_id` is the trip's, read by "Get pitches" (the `pitches` table) and matched in "Build response"; `""` for a trip made by hand or pitched before the Slack bot. `going` and `waitlist` list who signed up (distinct `user_sub`s, oldest `signups` row first, so `waitlist` is in line order), each as `{ name, team, jobTitle, isMe }` from `profiles` (`team` and `jobTitle` null when blank; `isMe` when the row's `user_sub` is `jwtPayload.sub`). Every signed-in colleague sees who is going: display fields only, never anyone's sub or email. `attendees` and `waitlisted` are the lengths of the two lists. Dates are sent as stored. The frontend uses this one list for `/workations`, the detail page (matched by `slug`) and `/me`.
  `photosUrl` is `drive_folder_url` once `drive_domain_shared` is true (set by "Trip Drive Folders" the morning after the trip ends, when everyone at n8n.io can open the folder), `""` otherwise.
- **`GET /trip-photos`** answers `404 { message }` unless the trip has a `drive_folder_id` and `drive_domain_shared` is true: the same rule as `photosUrl`, so the site only asks for trips that have one. Any signed-in colleague can call it, matching the folder's n8n.io permission. "List photos" asks the Drive API for up to eight images in the folder, oldest first (`'<id>' in parents and trashed = false and mimeType contains 'image/'`, with `thumbnailLink`). "Fetch thumbnail" downloads each one 1600px wide (the link's `=s220` suffix becomes `=w1600`: a width rather than the longest side, so portrait photos also fill the trip page's photo, which is up to 1160px wide) with the `Google Drive` credential, and continues on error, so a broken thumbnail is skipped rather than failing the response. "Build photos" returns `{ photos: [{ src: "data:image/…;base64,…" }] }`, an estimated 250 to 500 KB per landscape photo (more for portrait), so up to a few MB per response. An empty folder answers `{ photos: [] }`. Every answer carries `Cache-Control: private, max-age=3600`. The browser only sends a `workationId`, never a Drive file id, so the route can't be used to read other files in the Drive account.
- **`GET /polls`** keeps only the newest vote row per (poll, user) by `updatedAt`, in case a race created duplicates. `voters` counts people with at least one selection. `suggested` is true for any option not seeded (`created_by_sub !== "seed"`).
- **`GET /me` / `POST /me`** share one webhook with _Allow Multiple HTTP Methods_. GET reads the caller's profile, signups and votes. `signups` lists the trips where the caller's row has `status = going`. `waitlist` lists those with `status = waitlist`, with `position` = 1 + the number of waitlist rows for that trip with an older `createdAt`. `organizing` lists the `workation_id`s whose `organizer` is the caller's sub. POST updates only `team` and `jobTitle`; name, email and picture are rewritten from Google on every sign-in.
- **`POST /rsvp`** checks that the trip exists and that today is on or before its `end_date`, like the frontend's `isPast()`.
  - `attending: true`: if the caller already has a row, it answers with that row's status. Otherwise it inserts a row with `status = going` while `capacity` is empty or the going count is below it, and `status = waitlist` after that. It answers `200 { status, position }`.
  - `attending: false`: it deletes the caller's `signups` row and their `logistics` row for the trip. If the deleted row was `going` and the trip has a waitlist, it sets the oldest waitlist row (by `createdAt`) to `going`. It answers `204`.
- **`GET /logistics` / `POST /logistics`** share one webhook with _Allow Multiple HTTP Methods_. GET returns the caller's row for `workationId`, or `mine: null`. POST requires a `signups` row for the caller and trip (either status) and today on or before `end_date`, otherwise `400 { message }`. It caps the one-line text fields at 200 characters and `expectations` at 500 (line breaks kept, at most one blank line, like a pitch description), stores empty strings as null, and upserts one row per (trip, person).
- **`GET /roster`** answers `404 { message }` unless the trip's `organizer` is the caller's sub (404, not 403: the frontend reads every 403 as an expired session). Otherwise it returns every `signups` row for the trip, going first and then the waitlist in order, joined with `profiles` (name, email, team) and `logistics`.
- **`GET /pitches`** returns pitches with `status = open`, plus those with `status = cancelled` whose `deadline` is today or later, so the people who were interested can read why, and those with `status = expired` whose `start_date` is today or later, while their organizer can still reopen them. It also returns every pitch whose `organizer` is the caller's sub, in any status, for "your pitches" on `/me`; other people's confirmed pitches, and their cancelled and expired ones past those dates, never leave n8n. "Get listed pitches" reads rows matching any of `status = open`, `status = cancelled`, `status = expired` or `organizer = jwtPayload.sub`, and "Build response" applies the date rules. Each comes with its interest count, `interestedPeople` (who is interested, oldest `pitch_interest` row first, one entry per `user_sub`, in the same `{ name, team, jobTitle, isMe }` shape as a trip's lists), whether the caller is interested, `organizedByMe` (the pitch's `organizer` is the caller's sub; the sub itself is never sent), the organizer's name from `profiles`, `cancelReason` from `cancel_reason` (`""` unless cancelled), and `imageUrl` / `imageAlt` from `image_url` / `image_alt` (`""` when there's no photo). `slackUrl` is the pitch's `slack_url` (`""` when it has no thread), and the top-level `slackChannelUrl` is `$vars.SLACK_CHANNEL_URL` (`""` when unset).
- **`POST /pitch`** validates the body with the same rules as the form (`PITCH_LIMITS` in `src/features/pitches.ts`): place ≤ 60 characters, description ≤ 600, costIncludes ≤ 200, accommodationUrl ≤ 500 and `http(s)://` only, capacity a whole number from 2 to 100 or null for no limit, threshold a whole number from 2 to the capacity (or 100 with no limit), start date after today, end date ≥ start date, deadline from today up to the day before the start date, costEstimate a whole number from 0 to 10,000 or null, imageUrl empty/null or an `https://` link of at most 1,000 characters (checked untrimmed, since a cut-off link is broken), and imageAlt ≤ 150 characters, required with a photo. The photo is a link to an image hosted elsewhere, usually on the accommodation's site: nothing is uploaded. Whether the link actually opens an image only the browser can check, so the form does that before sending. Failures answer `400 { message }`. It inserts the pitch with `status = open` and `organizer` = the caller, inserts a `pitch_interest` row for the caller, and answers `201 { pitchId }`.
- **`POST /pitch-update`** and **`POST /pitch-cancel`** are organizer only. Each reads the pitch by `body.pitchId` first and answers `404 { message }` when it's missing or its `organizer` isn't the caller's sub (the same answer for both, and 404 rather than 403, as for `/roster`), then `400 { message }` unless it's `open`. `/pitch-update` also accepts an `expired` pitch.
  - `/pitch-update` then runs the same body checks as `POST /pitch` and replaces every field the form sends, and sets `status = open`. For an expired pitch that reopens it: its deadline must be today or later, like any save, so the next "Date Check & Status Updates" run doesn't expire it again straight away. `pitch_id`, `organizer`, `workation_id` and the `pitch_interest` rows stay as they are, so everyone interested stays counted, including on a reopened pitch. A lower `threshold` can make the pitch go ahead at the next "Date Check & Status Updates" run.
  - `/pitch-cancel` collapses whitespace in `reason` (line breaks are kept), caps it at 300 characters and rejects it when empty. It sets `status = cancelled` and `cancel_reason`. Interest rows are kept.
  - `/pitch-update`'s "Validate update" also outputs `before`, the pitch's fields (and `status`) before the edit as JSON. After "Respond 200", "Notify Slack" sends it with `pitch_updated`, so the Slack thread shows what changed, and that an expired pitch was reopened.
  - Both answer `200` with no body. Their "Update pitch" node matches on `pitch_id`, `organizer` **and** the status read before (`status = open` for `/pitch-cancel`; for `/pitch-update`, the `status` that "Validate update" outputs, `open` or `expired`), so a pitch confirmed or expired by "Date Check & Status Updates" between the read and the write is left alone. In that rare case the route still answers 200.
- **`POST /pitch-interest`** checks the pitch exists, is `open` and its `deadline` hasn't passed. Then it upserts (`interested: true`) or deletes (`interested: false`) the caller's `pitch_interest` row. "Get pitch interest" reads the pitch's interest rows first, so "Validate interest" can set `changed` (whether the caller's state actually changes). Only a change notifies the organizer, so clicking twice doesn't send two DMs.
- **`POST /vote`** sends the **whole selection** for one poll, not a single toggle. Values not in `poll_options` for that poll are dropped, and the result is upserted as one row per (poll, user). An empty array clears the vote.
- **`POST /poll-option`** collapses whitespace, caps the value at 40 characters, and stores a lowercase `value_key` for duplicate checks.

## Date Check & Status Updates (scheduled workflow)

A separate workflow, **"Date Check & Status Updates"**, starts with a Schedule Trigger once a day (early morning). For each pitch with `status = open` (so cancelled and expired pitches are skipped, until `/pitch-update` reopens an expired one):

1. Count its `pitch_interest` rows.
2. **Enough interest** (count ≥ `threshold`): create the trip.
   - Insert a `workations` row:
     - `workation_id`: the highest existing id + 1, zero-padded to two digits
     - `slug`: the place, lowercased with non-letters turned into `-`, plus `-` and the start year, e.g. `example-town-country-2027`
     - `title`: `n8ncation #<workation_id>`
     - `place`, `start_date`, `end_date`, `description`, `capacity`, `organizer`: copied from the pitch
     - `image_url`, `image_alt`, `accommodation_url`, `cost_estimate`, `cost_includes`: copied from the pitch too, so the trip keeps its photo link, accommodation link and cost estimate. Each is empty when the pitch had none
   - Insert a `signups` row for each interested person, oldest interest first: `status = going` for the first `capacity`, `waitlist` after that. With no `capacity`, everyone gets `going`.
   - Set the pitch's `status = confirmed` and its `workation_id`.
3. **Deadline passed** (`deadline` < today) without enough interest: set `status = expired`. Everyone still sees it, marked expired, until its start date, and its organizer can reopen it by editing it with a new deadline (see `/pitch-update`).
4. Otherwise leave it open.

Its "Plan" node also lists one notification per decided pitch (`pitch_confirmed` with the new `workation_id`, or `pitch_expired`). "Notifications to send" runs after "Update pitch", the last write branch, so nothing is announced unless every write succeeded, and hands each one to "Slack Bot Notifier" (see [Slack notifications](#slack-notifications)). A trip whose pitch had no photo has none until someone adds `image_url` by hand.

## Trip Drive Folders (scheduled workflow)

A shared Google Drive folder per trip, where attendees upload photos and videos. **"Trip Drive Folders"** runs every morning at 06:30, after "Date Check & Status Updates". It's a separate workflow so a failing Drive call (an expired credential, say) never stops pitches from being decided. Every Drive call uses the `Google Drive` credential, so the folders live in that account's My Drive, under `$vars.DRIVE_PARENT_FOLDER_ID`.

1. **Read trips** reads `workations`, the `signups` rows with `status = going` and `profiles`. **Plan** compares dates as text with `$today`, like Date Check, and emits one item per trip with work to do. Trips with an unreadable date are skipped:
   - **On** (`start_date` ≤ today ≤ `end_date`): `create` when `drive_folder_id` is empty, otherwise `sync`. The item carries the emails that should have access: everyone going plus the `organizer`, from `profiles.email`, lowercased. People without a profile email are skipped.
   - **Ended** (`end_date` < today), with a `drive_folder_id` and `drive_domain_shared` not true: `domain`.
2. **create**: **Create folder** makes `<title>: <place> (<start_date> to <end_date>)`, for example `n8ncation #01: Example Town, Country (2027-05-03 to 2027-05-08)`. **Save folder** writes `drive_folder_id` and `drive_folder_url` (`https://drive.google.com/drive/folders/<id>`) on the trip's row **before** anyone is invited, so a failed save can't leave a shared folder that the next run would create again. **Notify Slack** then hands `photos_folder_created` with the trip's `workation_id` to "Slack Bot Notifier" (once per new folder, without waiting), which announces the folder in the trip's Slack thread (see [Slack notifications](#slack-notifications)). The trip then continues into the sync, so a new folder is shared the same morning.
3. **sync**: **List permissions** reads the folder's current permissions from the Drive API (the Drive node has no such operation). **Missing shares** keeps the emails that don't have a permission yet, and **Share with attendee** gives each one `writer`, with Drive's notification email and a short message. Because it diffs against Drive itself, a rerun shares nothing twice, and someone removed by hand is added back the next morning. Nobody is ever removed: whoever drops out keeps access to what they uploaded. Someone who becomes `going` during the trip gets access the next morning.
4. **domain**: **Share with n8n.io** adds a `reader` permission for the domain `n8n.io` (not discoverable in search), and **Mark domain shared** sets `drive_domain_shared = true`, so this happens once. Attendees keep edit access.

Uploaded files are owned by whoever uploaded them, not by the folder's owner. Once `drive_domain_shared` is true, `GET /workations` sends the folder link as `photosUrl`, and `GET /trip-photos` serves the photos that the trip's page steps through.

## Slack notifications

The bot posts in the workations Slack channel (`SLACK_CHANNEL_ID`) and sends DMs. Every message comes from one sub-workflow, **"Slack Bot Notifier"**. Its error workflow is "🪲 Error Notifier - Slack".

**How it's called.** Each caller has an Execute Workflow node ("Notify Slack", or "Notify sign-up" / "Notify cancellation" in `/rsvp`) placed **after** its Respond node, with _Wait for sub-workflow completion_ off. A slow or failing Slack never delays or breaks an API response. The inputs are ids only: `event`, `pitchId`, `workationId`, `actorSub` (who did it, from `jwtPayload.sub`) and `promoteSub`, all strings, `""` when unused. The one exception is `before`, which only `/pitch-update` sends: a JSON snapshot of the pitch's fields before the edit, since "Slack Bot Notifier" only sees the row after it. In the routes, an IF gate in front of the call (Execute Once) lets only a successful write through, because the Respond nodes also answer errors.

**What it does.**

1. Reads `pitches`, `pitch_interest`, `workations`, `signups` and `profiles` (all rows; small tables). It runs after the caller's writes, so the counts include the change that triggered it.
2. **Build messages** turns the event into one item per message: `{ target: "dm" | "channel" | "thread", lookupEmail, text, threadTs?, broadcast? }`. Text that colleagues typed is escaped for Slack (`&`, `<`, `>`). Links go to `$vars.SITE_URL`. Nobody is notified about their own action: an organizer gets no DM for their own interest, RSVP or cancellation. Thread replies only go to pitches with a `slack_ts`, so pitches from before the bot get none.
3. People in a message are written as placeholders: `{mention:<email>}` for the organizer in channel posts, and `{dm:<email>}` for attendees named in DMs to organizers. **People to look up** collects every recipient and every placeholder, once each. **Lookup Slack user** maps each `profiles.email` to a Slack user id and team id (`users.lookupByEmail`; _On Error: Continue_, so the order is kept). **Address messages** then fills in the placeholders: an `@`-mention, or for attendees a link to `slack://user?team=<team id>&id=<user id>`, which opens a DM with that person in the Slack desktop and mobile apps. Both fall back to the plain name when the lookup failed. It also drops DMs to people without a Slack account.
4. **Route** sends each message to **Send DM**, **Post to channel**, **Reply in thread** (with _Also send to channel_ when `broadcast` is true) or **Update post** (edits the pitch's channel post by its `ts`). For a channel post, **Get permalink** and **Save thread** store `slack_ts` and `slack_url` on the pitch.

| Event | Caller (after node) | Who gets what |
| --- | --- | --- |
| `pitch_created` | `/pitch` (Respond, if `ok`) | Channel post mentioning the organizer: place, dates, threshold, deadline, the description quoted, link to the pitch's own page `/pitches/<pitch_id>` (since 2026-10-30; posts before that link to the `/pitches` list, which still opens on the site). Becomes the pitch's discussion thread |
| `interest_added` | `/pitch-interest` (Respond 200, if `changed`) | DM to the organizer, with the new count; the person's name opens a DM with them. Says so when it reaches the threshold |
| `interest_removed` | `/pitch-interest` (Respond 204, if `changed`) | DM to the organizer, with the new count |
| `pitch_updated` | `/pitch-update` (Respond 200) | Compares `before` with the saved row. If anything changed, the original channel post is rewritten with the current details, and a reply in the thread lists each change (for example "Dates: Feb 22, 2027 to Feb 27, 2027 → Feb 26, 2027 to Mar 5, 2027"). When `before.status` was `expired`, the reply says the organizer reopened the pitch and until when interest counts, and is also sent to the channel. A save that changes nothing sends nothing |
| `pitch_cancelled` | `/pitch-cancel` (Respond 200) | Reply in the thread with the reason |
| `pitch_expired` | Date Check & Status Updates | Reply in the thread with the final count |
| `pitch_confirmed` | Date Check & Status Updates | Reply in the thread, also sent to the channel: spots are held until the deposit is paid, the waitlist moves up otherwise. DM to the organizer with next steps (deposits from everyone going, listed with DM links; booking; logistics). DM to everyone going ("you have a spot") and everyone waitlisted (with their position) |
| `photos_folder_created` | Trip Drive Folders (Save folder) | Reply in the thread of the pitch the trip came from (matched on `pitches.workation_id`), not sent to the channel: the folder is open for photos and videos, with the `drive_folder_url` link and a link to the trip page. Until the trip ends, only people going and the organizer can open the folder, so the message says everyone at n8n.io can view it after the trip. A trip made by hand, or whose pitch has no `slack_ts`, gets no message |
| `rsvp_added` | `/rsvp` (Respond JSON, if `action = insert`) | DM to the organizer: going ("ask for their deposit") or waitlisted (with position); the person's name opens a DM with them |
| `rsvp_cancelled` | `/rsvp` (Respond 204, if `action = delete`) | DM to the organizer, naming who moved up from the waitlist if anyone; both names open a DM. DM to the person who moved up: they're going and the organizer will ask for a deposit |

The site has no deposit tracking. The messages only ask organizers to collect deposits.

## Data Tables

Eight n8n Data Tables. Every table also has the system columns `id`, `createdAt` and `updatedAt`. There are no unique constraints, so the "one row per …" rules below are enforced by the workflows' upserts. `user_sub` is always the Google account's `sub` claim.

**Dates are always String columns, never Date columns.** Calendar days are stored as `YYYY-MM-DD` and date-times as `YYYY-MM-DDTHH:MM` (destination time, no timezone). That is exactly what the browser's date inputs produce and what the API sends, so workflows store and return them unchanged. The format also sorts and compares correctly as plain text: to check a date against today, compare it with `$today.toFormat('yyyy-MM-dd')`. The frontend rejects any other format and shows "Dates to be confirmed".

### `workations`: one row per trip (edited by hand)

| Column         | Type   | Notes                                                                                                                                                                                         |
| -------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workation_id` | string | Stable join key, zero-padded edition number: `"01"`, `"02"`                                                                                                                                   |
| `slug`         | string | URL segment, `/n8ncation/<slug>`. Must be unique, e.g. `example-town-2027`                                                                                                                           |
| `title`        | string | e.g. `n8ncation #01`                                                                                                                                                                          |
| `place`        | string | e.g. `Example Town, Country`                                                                                                                                                                           |
| `start_date`   | string | `YYYY-MM-DD`                                                                                                                                                                                  |
| `end_date`     | string | `YYYY-MM-DD`. Decides upcoming vs. past, and closes RSVPs after this day                                                                                                                      |
| `description`  | string | Plain text                                                                                                                                                                                    |
| `image_url`    | string | Absolute URL (or a root-relative path to a file in `public/`). Empty hides the photo. For a trip that started as a pitch, the pitch's photo link, often on another site                                                                                                          |
| `image_alt`    | string | Alt text for the photo                                                                                                                                                                        |
| `organizer`    | string | `user_sub` of the organizer → `profiles.user_sub`. Empty hides the "Organized by" line. Only shown if that person has signed in at least once. Also decides who sees the trip's attendee list |
| `capacity`     | number | Spots on the trip. Empty means no limit and no waitlist                                                                                                                                       |
| `accommodation_url` | string | `http(s)` link to the place people stay, or empty. Copied from the pitch |
| `cost_estimate` | number | Euros per person, or empty. Copied from the pitch |
| `cost_includes` | string | What the estimate covers, or empty. Copied from the pitch |
| `drive_folder_id` | string | Id of the trip's Google Drive folder. Set by "Trip Drive Folders" on the morning the trip starts; empty before |
| `drive_folder_url` | string | `https://drive.google.com/drive/folders/<drive_folder_id>`. Sent to the site as `photosUrl` once `drive_domain_shared` is true |
| `drive_domain_shared` | boolean | True once "Trip Drive Folders" has let everyone at n8n.io view the folder, after the trip |

### `signups`: one row per (trip, person)

| Column         | Type   | Notes                                                                               |
| -------------- | ------ | ----------------------------------------------------------------------------------- |
| `workation_id` | string | → `workations.workation_id`                                                         |
| `user_sub`     | string | → `profiles.user_sub`                                                               |
| `status`       | string | `going` or `waitlist`. Waitlist order is `createdAt`. Every existing row has it set |

### `logistics`: one row per (trip, person), private

| Column              | Type   | Notes                                                             |
| ------------------- | ------ | ----------------------------------------------------------------- |
| `workation_id`      | string | → `workations.workation_id`                                       |
| `user_sub`          | string | → `profiles.user_sub`                                             |
| `dietary`           | string | Null when empty. Max 200 characters, as are the other text fields |
| `room_preference`   | string |                                                                   |
| `emergency_contact` | string |                                                                   |
| `expectations`      | string | "What's important to you for this trip?" Multi-line, max 500      |

Only the owner (through `/logistics`) and the trip's organizer (through `/roster`) can read a row. The row is deleted when its owner cancels their RSVP.

### `pitches`: one row per pitched trip

| Column              | Type   | Notes                                                            |
| ------------------- | ------ | ---------------------------------------------------------------- |
| `pitch_id`          | string | Stable id, generated by `POST /pitch` (`p-` + time + random)     |
| `place`             | string |                                                                  |
| `start_date`        | string | `YYYY-MM-DD`                                                     |
| `end_date`          | string | `YYYY-MM-DD`                                                     |
| `description`       | string | Plain text; line breaks are kept                                 |
| `accommodation_url` | string | `http(s)` link, or empty                                         |
| `image_url`         | string | `https` link to a photo hosted elsewhere, or empty. Becomes the trip's `image_url` |
| `image_alt`         | string | Describes the photo. Set whenever `image_url` is; max 150 characters |
| `capacity`          | number | Empty means no limit; the trip it becomes has no limit either     |
| `threshold`         | number | Interested people needed by `deadline`                           |
| `deadline`          | string | `YYYY-MM-DD`, the last day interest counts                       |
| `cost_estimate`     | number | Euros per person, or empty                                       |
| `cost_includes`     | string |                                                                  |
| `organizer`         | string | `user_sub` of whoever pitched it; becomes the trip's `organizer` |
| `status`            | string | `open`, `confirmed`, `expired` or `cancelled`. "Date Check & Status Updates" sets `confirmed` and `expired` and only reads `open` rows; `/pitch-cancel` sets `cancelled`; `/pitch-update` sets `open` again, which reopens an `expired` pitch |
| `workation_id`      | string | Set when confirmed → `workations.workation_id`                   |
| `cancel_reason`     | string | The organizer's reason, set by `/pitch-cancel`. Empty otherwise. Max 300 characters |
| `slack_ts`          | string | Timestamp id of the pitch's post in the Slack channel, set by "Slack Bot Notifier". Later messages about the pitch reply to it as a thread. Empty for pitches from before the bot, or when the post failed |
| `slack_url`         | string | Permalink to that post, sent to the site as `slackUrl` for the "Open the Slack thread" link |

### `pitch_interest`: one row per (pitch, person)

| Column     | Type   | Notes                                                                         |
| ---------- | ------ | ----------------------------------------------------------------------------- |
| `pitch_id` | string | → `pitches.pitch_id`                                                          |
| `user_sub` | string | → `profiles.user_sub`. `createdAt` decides who gets the spots on confirmation |

### `profiles`: one row per person who has signed in

| Column     | Type   | Notes                                                                |
| ---------- | ------ | -------------------------------------------------------------------- |
| `user_sub` | string | Google `sub`, the identity key used everywhere                       |
| `email`    | string | From Google, refreshed on every sign-in                              |
| `name`     | string | From Google (given + family name), refreshed on sign-in              |
| `picture`  | string | Google avatar URL, refreshed on sign-in                              |
| `team`     | string | Editable on `/me`. Null when unset; the frontend caps it at 60 chars. With `name` and `jobTitle`, shown to every colleague in the lists of who is going on a trip or interested in a pitch |
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

Seeded today: the twelve months for `month`, and a few countries for `location`.

```
profiles.user_sub ◀── signups.user_sub
                  ◀── votes.user_sub
                  ◀── poll_options.created_by_sub (unless "seed")
                  ◀── workations.organizer
                  ◀── logistics.user_sub
                  ◀── pitches.organizer
                  ◀── pitch_interest.user_sub
workations.workation_id ◀── signups.workation_id
                        ◀── logistics.workation_id
                        ◀── pitches.workation_id (once confirmed)
pitches.pitch_id ◀── pitch_interest.pitch_id
poll_options.poll_id = votes.poll_id = src/data/polls.ts id
```
