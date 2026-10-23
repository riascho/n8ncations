/* n8ncations: the preview cards on the main page and the full card behind
   /n8ncation/<slug>, which is where RSVP lives.

   Both views come from the same GET /workations payload. The detail page
   resolves its slug against that list client-side rather than asking for one
   trip by slug, because the table is small and n8n Cloud queues requests FIFO
   — one call per page beats two.

   Upcoming and past are derived from end_date rather than stored in a status
   column, so a trip cannot sit in the wrong section because nobody remembered
   to update it. */

import * as api from "../api/client";
import { ApiError } from "../api/types";
import type { Workation } from "../api/types";
import { isSignedIn } from "../auth";
import { requireEl, template } from "../dom";
import { appPath, assetPath, currentAppPath } from "../paths";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/* ----------------------------------------------------------------
   Dates

   Handled as integers rather than Date objects throughout. A date-only string
   parses as UTC while `new Date()` reports local time, so comparing the two
   shifts a day in most of the world — and "is this trip over?" must not
   depend on the reader's timezone.
   ---------------------------------------------------------------- */

interface DateParts {
  year: number;
  month: number;
  day: number;
}

/* Tolerates a trailing time component: Data Table Date columns can come back
   as a full ISO datetime depending on how the workflow emits them, and the
   day is all we need either way. */
function parseDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** Sortable, comparable integer: 2026-11-06 becomes 20261106. */
function ordinal(date: DateParts): number {
  return date.year * 10000 + date.month * 100 + date.day;
}

function todayOrdinal(): number {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

function monthName(month: number): string {
  return MONTHS[month - 1] ?? "";
}

function isPast(workation: Workation): boolean {
  const end = parseDate(workation.endDate);
  /* An unparseable date is treated as upcoming: better to show a trip with
     odd dates than to quietly file it under history. */
  return end !== null && ordinal(end) < todayOrdinal();
}

function isoDate(date: DateParts): string {
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${date.year}-${month}-${day}`;
}

/* Writes the range into `target` as two <time> elements, so the machine-
   readable dates survive alongside the display text.

   Three shapes, each closed up as tightly as it can be without becoming
   ambiguous:
     same month   6–13 November 2026
     same year    28 October – 4 November 2026
     neither      28 December 2026 – 3 January 2027 */
function renderDateRange(target: HTMLElement, trip: Workation): void {
  target.replaceChildren();
  const from = parseDate(trip.startDate);
  const to = parseDate(trip.endDate);
  if (!from || !to) {
    target.textContent = "Dates to be confirmed";
    return;
  }

  const start = document.createElement("time");
  start.dateTime = isoDate(from);
  const end = document.createElement("time");
  end.dateTime = isoDate(to);
  end.textContent = `${to.day} ${monthName(to.month)} ${to.year}`;

  let separator = " – ";
  if (from.year === to.year && from.month === to.month) {
    start.textContent = String(from.day);
    /* Both halves are bare numbers, so the dash closes up. */
    separator = "–";
  } else if (from.year === to.year) {
    start.textContent = `${from.day} ${monthName(from.month)}`;
  } else {
    start.textContent = `${from.day} ${monthName(from.month)} ${from.year}`;
  }

  target.append(start, document.createTextNode(separator), end);
}

/* ----------------------------------------------------------------
   Shared bits
   ---------------------------------------------------------------- */

function attendeeText(count: number): string {
  if (count === 0) {
    return "No one has signed up yet";
  }
  return count === 1 ? "1 person signed up" : `${count} people signed up`;
}

function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return fallback;
}

export function workationPath(trip: Workation): string {
  return appPath(`/n8ncation/${encodeURIComponent(trip.slug)}`);
}

/** Newest first, so the upcoming section leads with the nearest trip and the
    past section leads with the most recent one. */
function byDate(a: Workation, b: Workation, ascending: boolean): number {
  const left = parseDate(a.startDate);
  const right = parseDate(b.startDate);
  if (!left || !right) {
    return 0;
  }
  const diff = ordinal(left) - ordinal(right);
  return ascending ? diff : -diff;
}

/* ----------------------------------------------------------------
   Preview cards, main page
   ---------------------------------------------------------------- */

function buildCard(trip: Workation, past: boolean): HTMLElement {
  const card = template("trip-template");

  const titleId = `trip-${trip.workationId}-title`;
  const heading = requireEl(card, ".edition");
  heading.id = titleId;
  card.setAttribute("aria-labelledby", titleId);

  const link = requireEl(card, ".edition a");
  /* textContent, and every other field below: this is all operator-entered
     content coming back from a Data Table. */
  link.textContent = trip.title;
  link.setAttribute("href", workationPath(trip));

  const photo = card.querySelector("img");
  if (photo instanceof HTMLImageElement) {
    if (trip.imageUrl) {
      photo.src = assetPath(trip.imageUrl);
      photo.alt = trip.imageAlt;
      /* The upcoming card is the largest image above the fold. */
      if (!past) {
        photo.setAttribute("fetchpriority", "high");
      }
    } else {
      photo.remove();
    }
  }

  /* The photo label is a capsule, so it is mono ALL CAPS by stylesheet — the
     place name goes in as written. */
  requireEl(card, ".photo-label").textContent = trip.place;
  requireEl(card, ".status").textContent = past ? "Past" : "Upcoming";
  requireEl(card, ".place").textContent = trip.place;
  requireEl(card, ".trip-description").textContent = trip.description;
  requireEl(card, ".trip-attendees").textContent = attendeeText(trip.attendees);
  renderDateRange(requireEl(card, ".dates"), trip);

  return card;
}

function buildEmptyState(upcoming: Workation[]): HTMLElement {
  const empty = document.createElement("div");
  empty.className = "empty";

  const number = document.createElement("span");
  number.className = "empty-number";
  number.setAttribute("aria-hidden", "true");
  number.textContent = "#—";

  const copy = document.createElement("p");
  copy.textContent = "No past n8ncations yet.";
  copy.appendChild(document.createElement("br"));

  /* Generated rather than written into the markup, so the line cannot go
     stale once the first trip has been and gone. */
  const next = document.createElement("span");
  const first = upcoming[0];
  const start = first ? parseDate(first.startDate) : null;
  next.textContent = start
    ? `Our first one is coming up in ${monthName(start.month)} ${start.year}.`
    : "Our first one is still ahead.";
  copy.appendChild(next);

  empty.append(number, copy);
  return empty;
}

export async function mountWorkations(
  upcomingSlot: HTMLElement,
  pastSlot: HTMLElement,
  pastCount: HTMLElement,
): Promise<void> {
  const state = upcomingSlot.querySelector("[data-upcoming-state]");

  let workations: Workation[];
  try {
    ({ workations } = await api.getWorkations());
  } catch (error) {
    if (state) {
      state.textContent = describe(
        error,
        "The n8ncations could not be loaded.",
      );
    }
    return;
  }

  const upcoming = workations
    .filter((trip) => !isPast(trip))
    .sort((a, b) => byDate(a, b, true));
  const past = workations.filter(isPast).sort((a, b) => byDate(a, b, false));

  upcomingSlot.replaceChildren();
  if (upcoming.length === 0) {
    const none = document.createElement("p");
    none.className = "trip-state";
    none.textContent =
      "Nothing on the calendar right now. The poll below decides the next one.";
    upcomingSlot.appendChild(none);
  }
  for (const trip of upcoming) {
    upcomingSlot.appendChild(buildCard(trip, false));
  }

  /* The heading is written singular in the markup, which stops being true the
     moment a second trip is booked. */
  const heading = document.getElementById("upcoming-title");
  if (heading && upcoming.length > 1) {
    heading.textContent = "Upcoming n8ncations";
  }

  pastSlot.replaceChildren();
  if (past.length === 0) {
    pastSlot.appendChild(buildEmptyState(upcoming));
  }
  for (const trip of past) {
    pastSlot.appendChild(buildCard(trip, true));
  }
  pastCount.textContent = String(past.length).padStart(2, "0");
}

/* ----------------------------------------------------------------
   Your n8ncations, /me

   Lives here rather than in profile.ts because the date logic, trip paths
   and the upcoming/past split are all in this module, and feature modules
   must not import each other. Takes data instead of fetching it: main.ts
   already holds both responses for the page.

   Compact rows rather than the preview cards: this is an overview of where
   you have been and are going, and the full card is one click away on the
   trip page.
   ---------------------------------------------------------------- */

function buildRow(trip: Workation): HTMLElement {
  const row = template("my-trip-template");
  const link = requireEl(row, ".my-trip");
  link.setAttribute("href", workationPath(trip));
  /* textContent: operator-entered Data Table content. */
  requireEl(row, ".my-trip-title").textContent = trip.title;
  requireEl(row, ".my-trip-place").textContent = trip.place;
  renderDateRange(requireEl(row, ".my-trip-dates"), trip);
  return row;
}

function fillList(
  slot: HTMLElement,
  trips: Workation[],
  emptyText: string,
): void {
  slot.replaceChildren();
  if (trips.length === 0) {
    const none = document.createElement("p");
    none.className = "trip-state";
    none.textContent = emptyText;
    slot.appendChild(none);
    return;
  }
  const list = document.createElement("ul");
  list.className = "my-trips";
  for (const trip of trips) {
    list.appendChild(buildRow(trip));
  }
  slot.appendChild(list);
}

/** Renders the trips in `signups` — workation ids from GET /me — picked out
    of the full GET /workations list. One list request covers every id, so
    there is no per-trip fetch. */
export function renderMyWorkations(
  upcomingSlot: HTMLElement,
  pastSlot: HTMLElement,
  workations: Workation[],
  signups: string[],
): void {
  const mine = workations.filter((trip) => signups.includes(trip.workationId));
  const upcoming = mine
    .filter((trip) => !isPast(trip))
    .sort((a, b) => byDate(a, b, true));
  const past = mine.filter(isPast).sort((a, b) => byDate(a, b, false));

  fillList(
    upcomingSlot,
    upcoming,
    "You haven’t signed up for an upcoming n8ncation yet.",
  );
  fillList(pastSlot, past, "You haven’t been on an n8ncation yet.");
}

/* ----------------------------------------------------------------
   Detail page and RSVP
   ---------------------------------------------------------------- */

interface DetailView {
  root: HTMLElement;
  attendees: HTMLElement;
  button: HTMLButtonElement;
  status: HTMLElement;
  trip: Workation;
  going: boolean;
  busy: boolean;
}

/* Module scope so refreshRsvp() can re-read the RSVP state without the page
   shell needing a handle on it — the same arrangement polls.ts uses. */
let detail: DetailView | null = null;

function renderRsvp(v: DetailView): void {
  v.attendees.textContent = attendeeText(v.trip.attendees);
  v.button.setAttribute("aria-pressed", v.going ? "true" : "false");
  v.button.textContent = v.going ? "You’re going" : "Count me in";
  v.button.disabled = v.busy;
  v.root.classList.toggle("is-busy", v.busy);
}

async function toggleRsvp(v: DetailView): Promise<void> {
  if (v.busy) {
    return;
  }
  if (!isSignedIn()) {
    v.status.textContent = "Sign in with your n8n account to RSVP.";
    return;
  }

  const wasGoing = v.going;
  const previousCount = v.trip.attendees;

  /* Optimistic, then rolled back on failure — the same shape as a vote, and
     for the same reason: the write locks the control, because the Data Table
     upsert is "update, else insert" with no unique index and two overlapping
     writes for one person can both insert. */
  v.going = !wasGoing;
  v.trip.attendees = Math.max(0, previousCount + (v.going ? 1 : -1));
  v.busy = true;
  renderRsvp(v);

  try {
    await api.rsvp(v.trip.workationId, v.going);
    v.busy = false;
    renderRsvp(v);
    v.status.textContent = v.going
      ? "You’re on the list. Click again to cancel."
      : "Your RSVP has been cancelled.";
  } catch (error) {
    v.going = wasGoing;
    v.trip.attendees = previousCount;
    v.busy = false;
    renderRsvp(v);
    v.status.textContent = describe(error, "Your RSVP could not be saved.");
  }
}

function fillDetail(root: HTMLElement, trip: Workation, past: boolean): void {
  document.title = `${trip.title} — n8ncation`;

  requireEl(root, "[data-detail-title]").textContent = trip.title;
  requireEl(root, "[data-detail-status-label]").textContent = past
    ? "Past"
    : "Upcoming";
  requireEl(root, "[data-detail-place]").textContent = trip.place;
  requireEl(root, "[data-detail-description]").textContent = trip.description;
  requireEl(root, "[data-detail-label]").textContent = trip.place;
  renderDateRange(requireEl(root, "[data-detail-dates]"), trip);

  /* Hidden rather than "Organized by" with nothing after it: a trip may name
     no organizer, and one who has never signed in has no profile name for
     the workflow to resolve. textContent, because the name is user-entered.
     Mono ALL CAPS comes from the stylesheet, so it goes in as written. */
  const organizer = requireEl(root, "[data-detail-organizer]");
  const organizerName = trip.organizer?.name.trim() ?? "";
  organizer.textContent = organizerName ? `Organized by ${organizerName}` : "";
  organizer.hidden = organizerName === "";

  const photo = root.querySelector("[data-detail-photo]");
  if (photo instanceof HTMLImageElement) {
    if (trip.imageUrl) {
      photo.src = assetPath(trip.imageUrl);
      photo.alt = trip.imageAlt;
    } else {
      photo.remove();
    }
  }
}

/** Reads the slug off /n8ncation/<slug>. The "/n8ncation/" prefix also
    appears in the inline script in index.html that picks this view. */
function slugFromLocation(): string {
  const path = /^\/n8ncation\/([^/?#]+)/.exec(currentAppPath());
  if (!path?.[1]) {
    return "";
  }
  try {
    return decodeURIComponent(path[1]);
  } catch {
    /* A malformed escape such as /n8ncation/%E0 — treat it as no slug
       rather than throwing before the page can say anything. */
    return "";
  }
}

export async function mountWorkationDetail(root: HTMLElement): Promise<void> {
  const state = requireEl(document, "[data-detail-state]");
  const slug = slugFromLocation();

  if (!slug) {
    state.textContent = "That link is missing an n8ncation.";
    return;
  }

  let workations: Workation[];
  try {
    ({ workations } = await api.getWorkations());
  } catch (error) {
    state.textContent = describe(error, "This n8ncation could not be loaded.");
    return;
  }

  const trip = workations.find((candidate) => candidate.slug === slug);
  if (!trip) {
    state.textContent = "We could not find that n8ncation.";
    return;
  }

  const past = isPast(trip);
  fillDetail(root, trip, past);
  state.textContent = "";
  state.hidden = true;
  root.hidden = false;

  const rsvp = requireEl(root, "[data-detail-rsvp]");
  const button = root.querySelector("[data-detail-button]");
  const status = requireEl(root, "[data-detail-rsvp-status]");
  const attendees = requireEl(root, "[data-detail-attendees]");

  if (past) {
    /* Nothing to sign up for. The count stays, because who came is the
       interesting part of a trip that already happened. */
    attendees.textContent = attendeeText(trip.attendees);
    button?.remove();
    status.textContent = "This n8ncation has already happened.";
    return;
  }

  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const view: DetailView = {
    root: rsvp,
    attendees,
    button,
    status,
    trip,
    going: false,
    busy: false,
  };
  detail = view;

  renderRsvp(view);
  button.addEventListener("click", () => {
    status.textContent = "";
    void toggleRsvp(view);
  });

  await refreshRsvp();
}

/* Whether you are already on the list is your own state, so it comes from /me
   rather than from the trip list, which returns counts only. Called after
   the card is already on screen, so the trip details never wait on a second
   request. */
async function refreshRsvp(): Promise<void> {
  const view = detail;
  if (!view) {
    return;
  }

  if (!isSignedIn()) {
    /* The session lapsed after the card loaded. The count keeps the RSVP; it
       just stops being marked as yours. */
    view.going = false;
    renderRsvp(view);
    return;
  }

  try {
    const me = await api.getMe();
    view.going = me.signups.includes(view.trip.workationId);
    renderRsvp(view);
  } catch (error) {
    if (error instanceof ApiError && error.isAuthFailure) {
      /* Session lapsed. The card already loaded, so leave it up. */
      return;
    }
  }
}
