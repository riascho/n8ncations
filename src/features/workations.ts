/* n8ncations: the preview cards on /workations and the full card behind
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
import type { SignupStatus, WaitlistEntry, Workation } from "../api/types";
import { isSignedIn } from "../auth";
import { requireEl, template } from "../dom";
import { euros, safeUrl } from "../format";
import { appPath, assetPath, currentAppPath } from "../paths";
import {
  monthName,
  ordinal,
  parseDate,
  renderDateRange,
  todayOrdinal,
} from "../dates";

function isPast(workation: Workation): boolean {
  const end = parseDate(workation.endDate);
  /* An unparseable date is treated as upcoming: better to show a trip with
     odd dates than to quietly file it under history. */
  return end !== null && ordinal(end) < todayOrdinal();
}

/* ----------------------------------------------------------------
   Shared bits
   ---------------------------------------------------------------- */

function isFull(trip: Workation): boolean {
  return trip.capacity !== null && trip.attendees >= trip.capacity;
}

/* With a capacity, the line leads with spots ("5 of 6 spots taken"), since
   that is what decides whether you get one. The waitlist is added only when
   somebody is on it. */
function attendeeText(trip: Workation): string {
  const count = trip.attendees;
  let text: string;
  if (trip.capacity !== null) {
    text = `${count} of ${trip.capacity} spots taken`;
  } else if (count === 0) {
    text = "No one has signed up yet";
  } else {
    text = count === 1 ? "1 person signed up" : `${count} people signed up`;
  }
  if (trip.waitlisted > 0) {
    text += ` · ${trip.waitlisted} on the waitlist`;
  }
  return text;
}

function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return fallback;
}

/* Trip photos are often links to another site, carried over from the pitch
   the trip started as. No Referer, because many sites refuse images
   embedded elsewhere when they see one. If the link is broken anyway (the
   listing was taken down, the URL expired), the image goes and the grey
   photo area stays. Called before src is set, so no error is missed. */
function showPhoto(photo: HTMLImageElement): void {
  photo.referrerPolicy = "no-referrer";
  photo.addEventListener("error", () => {
    photo.remove();
  });
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
   Preview cards, /workations
   ---------------------------------------------------------------- */

function buildCard(
  trip: Workation,
  past: boolean,
  first: boolean,
): HTMLElement {
  const card = template("trip-template");
  /* Past trips are a quick overview, so their slides are smaller and drop
     the description (see .trip-compact in styles.css). */
  card.classList.toggle("trip-compact", past);

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
      showPhoto(photo);
      photo.src = assetPath(trip.imageUrl);
      photo.alt = trip.imageAlt;
      /* The first upcoming card is the largest image above the fold. Past
         slides mostly start off-screen in their carousel. */
      if (!past && first) {
        photo.setAttribute("fetchpriority", "high");
      }
      if (past) {
        photo.loading = "lazy";
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
  requireEl(card, ".trip-attendees").textContent = attendeeText(trip);
  renderDateRange(requireEl(card, ".dates"), trip.startDate, trip.endDate);

  return card;
}

/* ----------------------------------------------------------------
   Carousel, /workations

   A horizontally scrolling list with CSS scroll snapping, so touch,
   trackpad and keyboard scrolling work without any code. The buttons only
   add a way to page through with a mouse.
   ---------------------------------------------------------------- */

function buildTrack(cards: HTMLElement[], variant: string): HTMLElement {
  const track = document.createElement("ul");
  track.className = `carousel-track carousel-${variant}`;
  for (const card of cards) {
    const slide = document.createElement("li");
    slide.className = "carousel-slide";
    slide.appendChild(card);
    track.appendChild(slide);
  }
  return track;
}

/* Pages by however many whole slides are in view. The controls stay hidden
   while everything fits, and each end's button is marked unavailable with
   aria-disabled rather than disabled, so a keyboard user's focus is not
   dropped when they reach it. */
function mountCarousel(track: HTMLElement, controls: HTMLElement): void {
  const prev = requireEl(controls, "[data-carousel-prev]");
  const next = requireEl(controls, "[data-carousel-next]");

  const page = (): number => {
    const slide = track.firstElementChild;
    if (!(slide instanceof HTMLElement)) {
      return track.clientWidth;
    }
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const step = slide.offsetWidth + gap;
    return Math.max(1, Math.floor((track.clientWidth + gap) / step)) * step;
  };

  const update = (): void => {
    /* A pixel of slack: scroll positions can land on fractions. */
    const end = track.scrollWidth - track.clientWidth - 1;
    controls.hidden = end <= 0;
    prev.setAttribute("aria-disabled", String(track.scrollLeft <= 1));
    next.setAttribute("aria-disabled", String(track.scrollLeft >= end));
  };

  /* No behavior option: the track's scroll-behavior in styles.css decides,
     so reduced motion is honored there. */
  prev.addEventListener("click", () => {
    track.scrollBy({ left: -page() });
  });
  next.addEventListener("click", () => {
    track.scrollBy({ left: page() });
  });
  track.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(track);
  update();
}

/* Fills a section's slot with a carousel of cards. The controls sit in the
   same section's heading. */
function renderCarousel(
  slot: HTMLElement,
  cards: HTMLElement[],
  variant: string,
): void {
  const track = buildTrack(cards, variant);
  slot.appendChild(track);
  const controls = slot
    .closest("section")
    ?.querySelector<HTMLElement>("[data-carousel-controls]");
  if (controls) {
    mountCarousel(track, controls);
  }
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
      "Nothing on the calendar right now. The polls under Vote decide the next one.";
    upcomingSlot.appendChild(none);
  } else {
    renderCarousel(
      upcomingSlot,
      upcoming.map((trip, index) => buildCard(trip, false, index === 0)),
      "upcoming",
    );
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
  } else {
    renderCarousel(
      pastSlot,
      past.map((trip) => buildCard(trip, true, false)),
      "past",
    );
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

function buildRow(trip: Workation, waitlistPosition?: number): HTMLElement {
  const row = template("my-trip-template");
  const link = requireEl(row, ".my-trip");
  link.setAttribute("href", workationPath(trip));
  /* textContent: operator-entered Data Table content. */
  requireEl(row, ".my-trip-title").textContent = trip.title;
  requireEl(row, ".my-trip-place").textContent = trip.place;
  renderDateRange(
    requireEl(row, ".my-trip-dates"),
    trip.startDate,
    trip.endDate,
  );
  if (waitlistPosition !== undefined) {
    requireEl(row, ".my-trip-meta").append(` · Waitlist #${waitlistPosition}`);
  }
  return row;
}

function fillList(
  slot: HTMLElement,
  trips: Workation[],
  emptyText: string,
  waitlist: WaitlistEntry[] = [],
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
    const entry = waitlist.find(
      (item) => item.workationId === trip.workationId,
    );
    list.appendChild(buildRow(trip, entry?.position));
  }
  slot.appendChild(list);
}

/** Renders the trips in `signups` — workation ids from GET /me — picked out
    of the full GET /workations list. One list request covers every id, so
    there is no per-trip fetch. Upcoming trips you are waitlisted for are
    listed too, marked with your place in line. */
export function renderMyWorkations(
  upcomingSlot: HTMLElement,
  pastSlot: HTMLElement,
  workations: Workation[],
  signups: string[],
  waitlist: WaitlistEntry[],
): void {
  const mine = workations.filter((trip) => signups.includes(trip.workationId));
  const waiting = workations.filter(
    (trip) =>
      !isPast(trip) &&
      waitlist.some((entry) => entry.workationId === trip.workationId),
  );
  const upcoming = [...mine.filter((trip) => !isPast(trip)), ...waiting].sort(
    (a, b) => byDate(a, b, true),
  );
  const past = mine.filter(isPast).sort((a, b) => byDate(a, b, false));

  fillList(
    upcomingSlot,
    upcoming,
    "You haven’t signed up for an upcoming n8ncation yet.",
    waitlist,
  );
  fillList(pastSlot, past, "You haven’t been on an n8ncation yet.");
}

/* ----------------------------------------------------------------
   Detail page and RSVP
   ---------------------------------------------------------------- */

/** What the rest of the trip page needs to know about the reader: handed to
    main.ts whenever it changes, so it can show or hide the logistics form
    and the organizer's attendee list without this module importing them. */
export interface DetailState {
  trip: Workation;
  past: boolean;
  signup: SignupStatus | null;
  organizing: boolean;
}

export type DetailListener = (state: DetailState) => void;

interface DetailView {
  root: HTMLElement;
  attendees: HTMLElement;
  button: HTMLButtonElement;
  status: HTMLElement;
  trip: Workation;
  signup: SignupStatus | null;
  /** Place in line while `signup` is "waitlist". */
  position: number | null;
  organizing: boolean;
  busy: boolean;
  /** Bumped on every RSVP click, so refreshRsvp() can tell its response is
      stale. */
  edits: number;
  onChange: DetailListener;
}

/* Module scope so refreshRsvp() can re-read the RSVP state without the page
   shell needing a handle on it — the same arrangement polls.ts uses. */
let detail: DetailView | null = null;

function notifyChange(v: DetailView): void {
  v.onChange({
    trip: v.trip,
    past: false,
    signup: v.signup,
    organizing: v.organizing,
  });
}

function buttonText(v: DetailView): string {
  if (v.signup === "going") {
    return "You’re going";
  }
  if (v.signup === "waitlist") {
    return v.position === null
      ? "You’re on the waitlist"
      : `Waitlist #${v.position}`;
  }
  return isFull(v.trip) ? "Join the waitlist" : "Count me in";
}

function renderRsvp(v: DetailView): void {
  v.attendees.textContent = attendeeText(v.trip);
  v.button.setAttribute("aria-pressed", v.signup ? "true" : "false");
  v.button.textContent = buttonText(v);
  v.button.disabled = v.busy;
  v.root.classList.toggle("is-busy", v.busy);
}

function joinedText(v: DetailView): string {
  if (v.signup === "waitlist") {
    const place = v.position === null ? "" : ` You’re number ${v.position}.`;
    return `The trip is full, so you’re on the waitlist.${place} Spots that open up go to the waitlist in order. Click again to leave it.`;
  }
  return "You’re on the list. Click again to cancel.";
}

async function toggleRsvp(v: DetailView): Promise<void> {
  if (v.busy) {
    return;
  }
  if (!isSignedIn()) {
    v.status.textContent = "Sign in with your n8n account to RSVP.";
    return;
  }

  const before = {
    signup: v.signup,
    position: v.position,
    attendees: v.trip.attendees,
    waitlisted: v.trip.waitlisted,
  };
  const joining = before.signup === null;

  /* Optimistic, then rolled back on failure — the same shape as a vote, and
     for the same reason: the write locks the control, because the Data Table
     upsert is "update, else insert" with no unique index and two overlapping
     writes for one person can both insert.

     The guess mirrors the workflow: a spot while there is room, otherwise
     the waitlist. Giving up a spot hands it to the first person waiting, so
     the spot count stays and the waitlist shrinks instead. */
  if (joining) {
    v.signup = isFull(v.trip) ? "waitlist" : "going";
    v.position = v.signup === "waitlist" ? before.waitlisted + 1 : null;
    if (v.signup === "going") {
      v.trip.attendees += 1;
    } else {
      v.trip.waitlisted += 1;
    }
  } else {
    if (before.signup === "waitlist" || before.waitlisted > 0) {
      v.trip.waitlisted = Math.max(0, before.waitlisted - 1);
    } else {
      v.trip.attendees = Math.max(0, before.attendees - 1);
    }
    v.signup = null;
    v.position = null;
  }
  v.busy = true;
  v.edits += 1;
  renderRsvp(v);

  try {
    const result = await api.rsvp(v.trip.workationId, joining);
    /* The server has the final say on where you landed: somebody may have
       taken the last spot while this page was open. */
    if (joining && result && result.status !== v.signup) {
      const toWaitlist = result.status === "waitlist";
      v.trip.attendees += toWaitlist ? -1 : 1;
      v.trip.waitlisted += toWaitlist ? 1 : -1;
      v.signup = result.status;
    }
    if (joining && result) {
      v.position = result.position;
    }
    v.busy = false;
    renderRsvp(v);
    v.status.textContent = joining
      ? joinedText(v)
      : before.signup === "waitlist"
        ? "You’ve left the waitlist."
        : "Your RSVP has been cancelled.";
    notifyChange(v);
  } catch (error) {
    v.signup = before.signup;
    v.position = before.position;
    v.trip.attendees = before.attendees;
    v.trip.waitlisted = before.waitlisted;
    v.busy = false;
    renderRsvp(v);
    v.status.textContent = describe(error, "Your RSVP could not be saved.");
    notifyChange(v);
  }
}

/* Cost and accommodation, carried over from the pitch. Each fact is hidden
   when it is empty, and the list with them when both are, so a hand-made
   trip without either looks as it always did. */
function fillFacts(root: HTMLElement, trip: Workation): void {
  const facts = requireEl(root, "[data-detail-facts]");

  const cost = requireEl(facts, "[data-detail-fact=cost]");
  const hasCost = trip.costEstimate !== null;
  if (trip.costEstimate !== null) {
    requireEl(cost, "[data-detail-cost]").textContent =
      `${euros.format(trip.costEstimate)} per person`;
    const includes = requireEl(cost, "[data-detail-includes]");
    includes.textContent = trip.costIncludes;
    includes.hidden = trip.costIncludes === "";
  }
  cost.hidden = !hasCost;

  const stay = requireEl(facts, "[data-detail-fact=stay]");
  const href = trip.accommodationUrl ? safeUrl(trip.accommodationUrl) : null;
  if (href) {
    requireEl(stay, "a").setAttribute("href", href);
  }
  stay.hidden = href === null;

  facts.hidden = !hasCost && href === null;
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
  renderDateRange(
    requireEl(root, "[data-detail-dates]"),
    trip.startDate,
    trip.endDate,
  );

  /* Hidden rather than "Organized by" with nothing after it: a trip may name
     no organizer, and one who has never signed in has no profile name for
     the workflow to resolve. textContent, because the name is user-entered.
     Mono ALL CAPS comes from the stylesheet, so it goes in as written. */
  const organizer = requireEl(root, "[data-detail-organizer]");
  const organizerName = trip.organizer?.name.trim() ?? "";
  organizer.textContent = organizerName ? `Organized by ${organizerName}` : "";
  organizer.hidden = organizerName === "";

  fillFacts(root, trip);

  const photo = root.querySelector("[data-detail-photo]");
  if (photo instanceof HTMLImageElement) {
    if (trip.imageUrl) {
      showPhoto(photo);
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

export async function mountWorkationDetail(
  root: HTMLElement,
  onChange: DetailListener,
): Promise<void> {
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
    attendees.textContent = attendeeText(trip);
    button?.remove();
    status.textContent = "This n8ncation has already happened.";
    /* The organizer can still look back at who came. */
    try {
      const me = await api.getMe();
      onChange({
        trip,
        past: true,
        signup: me.signups.includes(trip.workationId) ? "going" : null,
        organizing: me.organizing.includes(trip.workationId),
      });
    } catch {
      /* The card is already up; the attendee list is an extra. */
    }
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
    signup: null,
    position: null,
    organizing: false,
    busy: false,
    edits: 0,
    onChange,
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
    view.signup = null;
    view.position = null;
    renderRsvp(view);
    return;
  }

  /* Taken before the await, as in polls.ts: a click while /me is in flight
     makes this response older than what is on screen, and applying it would
     undo the optimistic state and double-count when the RSVP lands. */
  const startedAt = view.edits;

  try {
    const me = await api.getMe();
    const id = view.trip.workationId;
    view.organizing = me.organizing.includes(id);
    if (!view.busy && view.edits === startedAt) {
      const waiting = me.waitlist.find((entry) => entry.workationId === id);
      view.signup = me.signups.includes(id)
        ? "going"
        : waiting
          ? "waitlist"
          : null;
      view.position = waiting?.position ?? null;
      renderRsvp(view);
    }
    /* While an RSVP is in flight it reports the outcome itself once it
       settles, so the rest of the page never sees a guess. */
    if (!view.busy) {
      notifyChange(view);
    }
  } catch (error) {
    if (error instanceof ApiError && error.isAuthFailure) {
      /* Session lapsed. The card already loaded, so leave it up. */
      return;
    }
  }
}
