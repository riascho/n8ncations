/* n8ncations: the preview cards on /workations and the full card behind
   /n8ncation/<slug>, which is where RSVP lives. On /workations, confirmed
   trips share the "Coming up" grid with the pitches: this module builds the
   trip cards and main.ts merges them with the pitch cards from pitches.ts.

   Both views come from the same GET /workations payload. The detail page
   resolves its slug against that list client-side rather than asking for one
   trip by slug, because the table is small and n8n Cloud queues requests FIFO
   — one call per page beats two.

   Upcoming and past are derived from end_date rather than stored in a status
   column, so a trip cannot sit in the wrong section because nobody remembered
   to update it. */

import * as api from "../api/client";
import { ApiError } from "../api/types";
import type { Me, SignupStatus, WaitlistEntry, Workation } from "../api/types";
import { isSignedIn } from "../auth";
import { requireEl, template } from "../dom";
import type { ListedCard } from "../dom";
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
   Preview cards, /workations: confirmed trips in "Coming up" (.listing,
   the same shape as a pitch card), past trips (.trip-compact) in their
   carousel
   ---------------------------------------------------------------- */

/* A compact slide for the past-trips carousel: a quick overview, with the
   description one click away on the trip page. */
function buildPastCard(trip: Workation): HTMLElement {
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
      showPhoto(photo);
      photo.src = assetPath(trip.imageUrl);
      photo.alt = trip.imageAlt;
      /* Past slides mostly start off-screen in their carousel. */
      photo.loading = "lazy";
    } else {
      photo.remove();
    }
  }

  /* The photo label is a capsule, so it is mono ALL CAPS by stylesheet — the
     place name goes in as written. */
  requireEl(card, ".photo-label").textContent = trip.place;
  requireEl(card, ".place").textContent = trip.place;
  requireEl(card, ".trip-attendees").textContent = attendeeText(trip);
  renderDateRange(requireEl(card, ".dates"), trip.startDate, trip.endDate);

  return card;
}

/* "5 of 6 spots taken", or "4 people signed up" without a capacity. The
   waitlist goes on the meta line underneath instead. */
function spotsText(trip: Workation): string {
  const count = trip.attendees;
  if (trip.capacity !== null) {
    return `${count} of ${trip.capacity} spots taken`;
  }
  if (count === 0) {
    return "No one has signed up yet";
  }
  return count === 1 ? "1 person signed up" : `${count} people signed up`;
}

/* A confirmed trip in "Coming up". Same shape as a pitch card (.listing),
   but solid-bordered with a pink "Confirmed" capsule: this one is booked.
   The title opens the trip page; the button RSVPs right here, with the same
   toggle as the trip page, and shows where you stand. `me` is the reader's
   GET /me, or null when it failed: without it the button can't say whether
   you're going, so it is left out. */
function buildListingCard(
  trip: Workation,
  first: boolean,
  me: Me | null,
): HTMLElement {
  const card = template("listing-trip-template");

  const titleId = `trip-${trip.workationId}-title`;
  const heading = requireEl(card, ".listing-title");
  heading.id = titleId;
  card.setAttribute("aria-labelledby", titleId);

  /* The photo box stays when there is no photo, or when its link breaks:
     its dot grid (.listing-photo-empty) keeps every card the same shape. */
  const box = requireEl(card, ".listing-photo");
  const photo = box.querySelector("img");
  if (photo instanceof HTMLImageElement) {
    if (trip.imageUrl) {
      photo.addEventListener("error", () => {
        photo.remove();
        box.classList.add("listing-photo-empty");
      });
      photo.src = assetPath(trip.imageUrl);
      photo.alt = trip.imageAlt;
      /* The first confirmed card is the likeliest image above the fold. */
      if (first) {
        photo.setAttribute("fetchpriority", "high");
      }
    } else {
      photo.remove();
      box.classList.add("listing-photo-empty");
    }
  }

  /* textContent throughout: operator-entered Data Table content. */
  requireEl(card, ".listing-eyebrow").textContent = trip.title;
  /* The title links to the trip page. */
  const link = requireEl(heading, "a");
  link.textContent = trip.place;
  link.setAttribute("href", workationPath(trip));
  renderDateRange(
    requireEl(card, ".listing-dates"),
    trip.startDate,
    trip.endDate,
  );
  requireEl(card, ".listing-description").textContent = trip.description;

  /* Without a capacity there is nothing to fill, so no bar, just the count. */
  if (trip.capacity === null) {
    requireEl(card, ".card-track").remove();
  }
  const bar = card.querySelector<HTMLElement>(".card-bar");
  const progress = requireEl(card, ".listing-progress-text");
  const meta = requireEl(card, ".listing-meta");
  /* Repainted after every RSVP, which moves the counts. */
  const renderCounts = (): void => {
    if (bar && trip.capacity !== null) {
      const share = Math.min(1, trip.attendees / Math.max(1, trip.capacity));
      bar.style.setProperty("--pct", `${Math.round(share * 100)}%`);
    }
    progress.textContent = spotsText(trip);
    meta.textContent =
      trip.waitlisted > 0 ? `${trip.waitlisted} on the waitlist` : "";
    meta.hidden = trip.waitlisted === 0;
  };
  renderCounts();

  const button = card.querySelector(".listing-rsvp");
  const status = requireEl(card, ".listing-rsvp-status");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Expected the card's RSVP button");
  }
  if (!me) {
    button.remove();
    return card;
  }

  const id = trip.workationId;
  const waiting = me.waitlist.find((entry) => entry.workationId === id);
  const view: DetailView = {
    root: card,
    renderCounts,
    button,
    status,
    trip,
    signup: me.signups.includes(id) ? "going" : waiting ? "waitlist" : null,
    position: waiting?.position ?? null,
    organizing: me.organizing.includes(id),
    busy: false,
    edits: 0,
    /* Nothing else on /workations reacts to an RSVP. */
    onChange: () => {},
  };
  renderRsvp(view);
  button.addEventListener("click", () => {
    status.textContent = "";
    void toggleRsvp(view);
  });
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

/* ----------------------------------------------------------------
   Carousel, past trips on /workations

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

/* ----------------------------------------------------------------
   Lists, /workations

   main.ts fetches GET /workations and hands the trips over, because the
   "Coming up" grid also holds the pitches, which this module cannot load.
   ---------------------------------------------------------------- */

/** One card per trip that hasn't ended, for the "Coming up" grid. `me`
    sets each card's RSVP button; null leaves the buttons out. */
export function upcomingTripCards(
  workations: Workation[],
  me: Me | null,
): ListedCard[] {
  return workations
    .filter((trip) => !isPast(trip))
    .sort((a, b) => byDate(a, b, true))
    .map((trip, index) => ({
      card: buildListingCard(trip, index === 0, me),
      startDate: trip.startDate,
      last: false,
    }));
}

/** The "Past n8ncations" carousel, most recent first, and its count. */
export function renderPastTrips(
  pastSlot: HTMLElement,
  pastCount: HTMLElement,
  workations: Workation[],
): void {
  const upcoming = workations
    .filter((trip) => !isPast(trip))
    .sort((a, b) => byDate(a, b, true));
  const past = workations.filter(isPast).sort((a, b) => byDate(a, b, false));

  pastSlot.replaceChildren();
  if (past.length === 0) {
    pastSlot.appendChild(buildEmptyState(upcoming));
  } else {
    renderCarousel(pastSlot, past.map(buildPastCard), "past");
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

/* One RSVP control: the trip page's, or a confirmed trip's card in "Coming
   up" on /workations. Both share the toggle below; each repaints its own
   counts (the attendee line on the page, the spots bar on a card). */
interface DetailView {
  root: HTMLElement;
  renderCounts: () => void;
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
  v.renderCounts();
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

/* The same four facts as a pitch's page: estimated cost and group size
   always (the cost says when there is no estimate), the accommodation and
   the Slack thread when there is a link. Cost and accommodation are carried
   over from the pitch; the thread is the pitch's own. */
function fillFacts(root: HTMLElement, trip: Workation): void {
  const facts = requireEl(root, "[data-detail-facts]");

  requireEl(facts, "[data-detail-cost]").textContent =
    trip.costEstimate === null
      ? "Not estimated yet"
      : `${euros.format(trip.costEstimate)} per person`;
  const includes = requireEl(facts, "[data-detail-includes]");
  includes.textContent = trip.costIncludes;
  includes.hidden = trip.costIncludes === "";

  const capacity = requireEl(facts, "[data-detail-fact=capacity]");
  requireEl(capacity, "dd").textContent =
    trip.capacity === null ? "No limit" : `Up to ${trip.capacity}`;
  capacity.hidden = false;

  const stay = requireEl(facts, "[data-detail-fact=stay]");
  const href = trip.accommodationUrl ? safeUrl(trip.accommodationUrl) : null;
  if (href) {
    requireEl(stay, "a").setAttribute("href", href);
  }
  stay.hidden = href === null;

  const slack = requireEl(facts, "[data-detail-fact=slack]");
  const threadUrl = trip.slackUrl ? safeUrl(trip.slackUrl) : null;
  if (threadUrl) {
    requireEl(slack, "a").setAttribute("href", threadUrl);
  }
  slack.hidden = threadUrl === null;

  facts.hidden = false;
}

function fillDetail(root: HTMLElement, trip: Workation, past: boolean): void {
  document.title = `${trip.title} — n8ncation`;

  requireEl(root, "[data-detail-title]").textContent = trip.title;
  requireEl(root, "[data-detail-status-label]").textContent = past
    ? "Past"
    : "Confirmed";
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
    renderCounts: () => {
      attendees.textContent = attendeeText(trip);
    },
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
