/* Pitches: trips anyone can propose, which go ahead only with enough
   interest.

   - /pitches: one card per open pitch, with an "I'm interested"
     toggle and progress towards the pitch's threshold. The organizer's own
     card can also be edited or cancelled. A cancelled pitch stays listed,
     with the organizer's reason, until its deadline.
   - /pitch: the form to submit one. The person pitching becomes the
     organizer and counts as the first interested person.
   - /pitch?edit=<pitchId>: the same form, filled in, for the organizer.
   - /me: the list of pitches you organize, each open one linking to its
     edit form. main.ts fetches the data and hands it over.

   Nothing here confirms or expires a pitch. A scheduled n8n workflow does
   that once a day (see README → Pitches), so a confirmed pitch simply stops
   being listed here and shows up as a trip in GET /workations instead. */

import * as api from "../api/client";
import { ApiError } from "../api/types";
import type { NewPitch, Pitch, PitchStatus } from "../api/types";
import { isSignedIn } from "../auth";
import {
  formatDay,
  ordinal,
  parseDate,
  renderDateRange,
  todayIso,
} from "../dates";
import { requireEl, template } from "../dom";
import { euros, httpsUrl, safeUrl } from "../format";
import { appPath } from "../paths";

/* Limits shared with the validation in the /pitch, /pitch-update and
   /pitch-cancel workflows. Change them together. */
export const PITCH_LIMITS = {
  place: 60,
  description: 600,
  costIncludes: 200,
  accommodationUrl: 500,
  /* Image links from big hosting sites carry long query strings. */
  imageUrl: 1000,
  imageAlt: 150,
  cancelReason: 300,
  minPeople: 2,
  maxPeople: 100,
  maxCost: 10000,
} as const;

/* Multi-line text keeps its line breaks, unlike the one-line fields. Used
   for the pitch description and a cancellation reason. */
function tidyParagraph(value: string, max: number): string {
  return value
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return fallback;
}

/** The organizer's edit form for one pitch, linked from its card and /me. */
function editPath(pitchId: string): string {
  return `${appPath("/pitch")}?${new URLSearchParams({ edit: pitchId })}`;
}

/* ----------------------------------------------------------------
   Cards, /pitches
   ---------------------------------------------------------------- */

interface PitchView {
  root: HTMLElement;
  deadline: HTMLElement;
  progressBox: HTMLElement;
  progress: HTMLElement;
  bar: HTMLElement;
  button: HTMLButtonElement;
  cancelled: HTMLElement;
  reason: HTMLElement;
  /** The organizer's edit link and "Cancel pitch" button. */
  owner: HTMLElement;
  cancelOpen: HTMLButtonElement;
  cancelForm: HTMLFormElement;
  reasonField: HTMLTextAreaElement;
  cancelSubmit: HTMLButtonElement;
  status: HTMLElement;
  pitch: Pitch;
  busy: boolean;
  /** The organizer opened the cancel form. */
  confirming: boolean;
}

function progressText(pitch: Pitch): string {
  if (pitch.interested >= pitch.threshold) {
    return `${pitch.interested} interested · enough to go ahead`;
  }
  return `${pitch.interested} of ${pitch.threshold} interested`;
}

function renderPitch(v: PitchView): void {
  const { pitch } = v;
  const cancelled = pitch.status === "cancelled";
  v.root.classList.toggle("is-cancelled", cancelled);
  v.deadline.textContent = cancelled
    ? "Cancelled"
    : `Closes ${formatDay(pitch.deadline)}`;
  v.progressBox.hidden = cancelled;
  v.button.hidden = cancelled;
  v.cancelled.hidden = !cancelled;
  v.reason.textContent = pitch.cancelReason;
  /* Only shown to the organizer. Hiding is a convenience, not the check:
     the workflows refuse an edit or cancel from anyone else. */
  const canManage = pitch.organizedByMe && !cancelled;
  v.owner.hidden = !canManage || v.confirming;
  v.cancelForm.hidden = !canManage || !v.confirming;
  v.cancelSubmit.disabled = v.busy;

  v.progress.textContent = progressText(pitch);
  const share = Math.min(1, pitch.interested / Math.max(1, pitch.threshold));
  v.bar.style.setProperty("--pct", `${Math.round(share * 100)}%`);
  v.button.setAttribute(
    "aria-pressed",
    pitch.interestedByMe ? "true" : "false",
  );
  v.button.textContent = pitch.interestedByMe
    ? "You’re interested"
    : "I’m interested";
  v.button.disabled = v.busy;
  v.root.classList.toggle("is-busy", v.busy);
}

async function toggleInterest(v: PitchView): Promise<void> {
  if (v.busy) {
    return;
  }
  if (!isSignedIn()) {
    v.status.textContent = "Sign in with your n8n account first.";
    return;
  }

  const was = v.pitch.interestedByMe;
  const previousCount = v.pitch.interested;

  /* Optimistic, locked while in flight and rolled back on failure, like an
     RSVP: pitch_interest has the same non-atomic upsert. */
  v.pitch.interestedByMe = !was;
  v.pitch.interested = Math.max(0, previousCount + (was ? -1 : 1));
  v.busy = true;
  renderPitch(v);

  try {
    await api.setPitchInterest(v.pitch.pitchId, !was);
    v.busy = false;
    renderPitch(v);
    v.status.textContent = was
      ? "You’re no longer counted as interested."
      : "Counted. If it goes ahead, you’ll get a spot or a place on the waitlist.";
  } catch (error) {
    v.pitch.interestedByMe = was;
    v.pitch.interested = previousCount;
    v.busy = false;
    renderPitch(v);
    v.status.textContent = describe(error, "Your interest could not be saved.");
  }
}

async function cancelPitch(v: PitchView): Promise<void> {
  if (v.busy) {
    return;
  }
  const reason = tidyParagraph(v.reasonField.value, PITCH_LIMITS.cancelReason);
  if (!reason) {
    v.status.textContent = "Say why you’re cancelling the pitch.";
    v.reasonField.focus();
    return;
  }

  /* Optimistic like interest: the card shows as cancelled right away, stays
     locked while the request is in flight, and reopens the form, reason
     kept, if it fails. */
  const previous: { status: PitchStatus; cancelReason: string } = {
    status: v.pitch.status,
    cancelReason: v.pitch.cancelReason,
  };
  v.pitch.status = "cancelled";
  v.pitch.cancelReason = reason;
  v.confirming = false;
  v.busy = true;
  renderPitch(v);

  try {
    await api.cancelPitch(v.pitch.pitchId, reason);
    v.busy = false;
    renderPitch(v);
    v.status.textContent =
      "Pitch cancelled. Everyone can see your reason until the deadline.";
  } catch (error) {
    v.pitch.status = previous.status;
    v.pitch.cancelReason = previous.cancelReason;
    v.confirming = true;
    v.busy = false;
    renderPitch(v);
    v.status.textContent = describe(error, "The pitch could not be cancelled.");
  }
}

function button(root: HTMLElement, selector: string): HTMLButtonElement {
  const found = requireEl(root, selector);
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Expected ${selector} to be a <button>`);
  }
  return found;
}

function image(root: HTMLElement, selector: string): HTMLImageElement {
  const found = requireEl(root, selector);
  if (!(found instanceof HTMLImageElement)) {
    throw new Error(`Expected ${selector} to be an <img>`);
  }
  return found;
}

function buildPitchCard(pitch: Pitch): HTMLElement {
  const card = template("pitch-template");

  const titleId = `pitch-${pitch.pitchId}-title`;
  const heading = requireEl(card, ".pitch-place");
  heading.id = titleId;
  card.setAttribute("aria-labelledby", titleId);

  /* A link to a photo hosted elsewhere. Without one, or once the link turns
     out broken (the listing was taken down, the URL expired), the card is
     simply shown without a photo. */
  const photoBox = requireEl(card, ".pitch-photo");
  const photo = photoBox.querySelector("img");
  const photoUrl = pitch.imageUrl ? httpsUrl(pitch.imageUrl) : null;
  if (photo && photoUrl) {
    photo.addEventListener("error", () => {
      photoBox.remove();
    });
    photo.src = photoUrl;
    photo.alt = pitch.imageAlt;
  } else {
    photoBox.remove();
  }

  /* textContent throughout: every field was typed by whoever pitched it. */
  heading.textContent = pitch.place;
  renderDateRange(
    requireEl(card, ".pitch-dates"),
    pitch.startDate,
    pitch.endDate,
  );
  requireEl(card, ".pitch-description").textContent = pitch.description;
  requireEl(card, ".pitch-capacity").textContent =
    pitch.capacity === null ? "No limit" : `Up to ${pitch.capacity}`;

  const cost = requireEl(card, ".pitch-cost");
  if (pitch.costEstimate !== null) {
    cost.textContent = `${euros.format(pitch.costEstimate)} per person`;
  } else {
    cost.textContent = "Not estimated yet";
  }
  const includes = requireEl(card, ".pitch-includes");
  includes.textContent = pitch.costIncludes;
  includes.hidden = pitch.costIncludes === "";

  const stay = requireEl(card, "[data-fact=stay]");
  const href = pitch.accommodationUrl ? safeUrl(pitch.accommodationUrl) : null;
  if (href) {
    requireEl(stay, "a").setAttribute("href", href);
  } else {
    stay.remove();
  }

  const organizer = requireEl(card, "[data-fact=organizer]");
  const organizerName = pitch.organizer?.name.trim() ?? "";
  if (organizerName) {
    requireEl(organizer, "dd").textContent = organizerName;
  } else {
    organizer.remove();
  }

  const cancelForm = requireEl(card, ".pitch-cancel");
  const reasonField = requireEl(cancelForm, "textarea");
  if (
    !(cancelForm instanceof HTMLFormElement) ||
    !(reasonField instanceof HTMLTextAreaElement)
  ) {
    throw new Error("Expected the pitch cancel form and its reason field");
  }
  const reasonId = `pitch-${pitch.pitchId}-reason`;
  reasonField.id = reasonId;
  reasonField.maxLength = PITCH_LIMITS.cancelReason;
  requireEl(cancelForm, "label").setAttribute("for", reasonId);

  const owner = requireEl(card, ".pitch-owner");
  requireEl(owner, ".pitch-edit").setAttribute("href", editPath(pitch.pitchId));

  const view: PitchView = {
    root: card,
    deadline: requireEl(card, ".pitch-deadline"),
    progressBox: requireEl(card, ".pitch-progress"),
    progress: requireEl(card, ".pitch-progress-text"),
    bar: requireEl(card, ".pitch-bar"),
    button: button(card, ".pitch-button"),
    cancelled: requireEl(card, ".pitch-cancelled"),
    reason: requireEl(card, ".pitch-cancelled-reason"),
    owner,
    cancelOpen: button(owner, ".pitch-cancel-open"),
    cancelForm,
    reasonField,
    cancelSubmit: button(cancelForm, "button[type=submit]"),
    status: requireEl(card, ".pitch-status"),
    pitch,
    busy: false,
    confirming: false,
  };
  renderPitch(view);
  view.button.addEventListener("click", () => {
    view.status.textContent = "";
    void toggleInterest(view);
  });
  view.cancelOpen.addEventListener("click", () => {
    view.status.textContent = "";
    view.confirming = true;
    renderPitch(view);
    reasonField.focus();
  });
  button(cancelForm, ".pitch-cancel-keep").addEventListener("click", () => {
    view.status.textContent = "";
    view.confirming = false;
    renderPitch(view);
    view.cancelOpen.focus();
  });
  cancelForm.addEventListener("submit", (event) => {
    event.preventDefault();
    view.status.textContent = "";
    void cancelPitch(view);
  });
  return card;
}

/** Open pitches first, then cancelled ones. Within each, deadline first:
    the pitch that closes soonest needs attention first. */
function byDeadline(a: Pitch, b: Pitch): number {
  const rank = (pitch: Pitch): number => (pitch.status === "open" ? 0 : 1);
  if (rank(a) !== rank(b)) {
    return rank(a) - rank(b);
  }
  const left = parseDate(a.deadline);
  const right = parseDate(b.deadline);
  if (!left || !right) {
    return 0;
  }
  return ordinal(left) - ordinal(right);
}

/* /pitches lists what everyone gets from GET /pitches: open pitches, and
   cancelled ones until their deadline. The caller's own closed pitches,
   which the route also sends, are only for /me. */
function isListed(pitch: Pitch): boolean {
  return (
    pitch.status === "open" ||
    (pitch.status === "cancelled" && pitch.deadline >= todayIso())
  );
}

export async function mountPitches(slot: HTMLElement): Promise<void> {
  const state = slot.querySelector("[data-pitches-state]");
  let pitches: Pitch[];
  try {
    ({ pitches } = await api.getPitches());
    pitches = pitches.filter(isListed);
  } catch (error) {
    if (state) {
      state.textContent = describe(error, "The pitches could not be loaded.");
    }
    return;
  }

  slot.replaceChildren();
  /* Cancelled pitches don't count as open, but their cards still follow. */
  if (!pitches.some((pitch) => pitch.status === "open")) {
    const none = document.createElement("p");
    none.className = "trip-state";
    none.textContent = "No open pitches right now. Have an idea? Pitch it.";
    slot.appendChild(none);
  }
  for (const pitch of [...pitches].sort(byDeadline)) {
    slot.appendChild(buildPitchCard(pitch));
  }
}

/* ----------------------------------------------------------------
   Your pitches, /me

   The same compact rows as "your trips" on that page, from the caller's
   own pitches in GET /pitches, whatever their status. Open ones come first
   and link to their edit form. Closed ones (cancelled, expired, went ahead)
   are kept for reference, folded away in a quieter list below.
   ---------------------------------------------------------------- */

/* What a closed pitch's row says after its dates. */
function closedText(pitch: Pitch): string {
  if (pitch.status === "cancelled") {
    return `Cancelled: ${pitch.cancelReason}`;
  }
  if (pitch.status === "confirmed") {
    return "Went ahead as an n8ncation";
  }
  return `Expired with ${progressText(pitch)}`;
}

function buildMyPitchRow(pitch: Pitch): HTMLElement {
  const row = template("my-pitch-template");
  const link = requireEl(row, ".my-trip");
  /* textContent throughout: the organizer typed all of it. */
  requireEl(row, ".my-trip-title").textContent = pitch.place;
  const dates = document.createElement("span");
  renderDateRange(dates, pitch.startDate, pitch.endDate);
  const meta = requireEl(row, ".my-trip-meta");
  const action = requireEl(row, ".my-pitch-action");

  if (pitch.status === "open") {
    link.setAttribute("href", editPath(pitch.pitchId));
    meta.append(
      dates,
      ` · ${progressText(pitch)} · Closes ${formatDay(pitch.deadline)}`,
    );
    action.textContent = "Edit";
  } else {
    /* No href: nothing left to edit, so the row is not a link. */
    link.classList.add("is-static");
    meta.append(dates, ` · ${closedText(pitch)}`);
    action.remove();
  }
  return row;
}

function pitchList(pitches: Pitch[]): HTMLElement {
  const list = document.createElement("ul");
  list.className = "my-trips";
  for (const pitch of pitches) {
    list.appendChild(buildMyPitchRow(pitch));
  }
  return list;
}

/** Newest first: the pitch that closed most recently is the one you're
    most likely looking for. */
function byDeadlineDescending(a: Pitch, b: Pitch): number {
  return byDeadline(b, a);
}

export function renderMyPitches(slot: HTMLElement, pitches: Pitch[]): void {
  const mine = pitches.filter((pitch) => pitch.organizedByMe);
  const open = mine.filter((pitch) => pitch.status === "open").sort(byDeadline);
  const closed = mine
    .filter((pitch) => pitch.status !== "open")
    .sort(byDeadlineDescending);

  slot.replaceChildren();
  if (open.length === 0) {
    const none = document.createElement("p");
    none.className = "trip-state";
    none.textContent =
      closed.length === 0
        ? "You haven’t pitched an n8ncation yet."
        : "You have no open pitches right now.";
    slot.appendChild(none);
  } else {
    slot.appendChild(pitchList(open));
  }

  /* Folded away by default: kept for reference, not for action. */
  if (closed.length > 0) {
    const details = document.createElement("details");
    details.className = "my-pitches-closed";
    const summary = document.createElement("summary");
    summary.textContent = `Closed pitches (${closed.length})`;
    details.append(summary, pitchList(closed));
    slot.appendChild(details);
  }
}

/* ----------------------------------------------------------------
   Pitch form, /pitch
   ---------------------------------------------------------------- */

type FieldName = keyof NewPitch;

/* The photo is a link to an image hosted elsewhere. The browser cannot read
   a third-party image's content type (CORS), so the only way to tell an
   image link from a link to a web page is to load it: "loaded" is the one
   state a pitch can be submitted in, apart from "none". */
type PhotoState = "none" | "invalid" | "loading" | "loaded" | "broken";

interface PhotoCheck {
  /** The trimmed link this state belongs to. */
  url: string;
  state: PhotoState;
}

const PHOTO_BROKEN =
  "This link doesn’t open an image. On the website, right-click the photo and choose “Copy image address”.";

interface FormView {
  form: HTMLFormElement;
  submit: HTMLButtonElement;
  status: HTMLElement;
  busy: boolean;
  /** The pitch being edited, from ?edit=, or null for a new pitch. */
  editing: string | null;
  photo: PhotoCheck;
  preview: HTMLElement;
  previewImage: HTMLImageElement;
  photoStatus: HTMLElement;
}

function input(form: HTMLFormElement, name: FieldName): HTMLInputElement {
  const found = form.elements.namedItem(name);
  if (
    !(found instanceof HTMLInputElement) &&
    !(found instanceof HTMLTextAreaElement)
  ) {
    throw new Error(`Expected a pitch field named ${name}`);
  }
  /* A textarea has the same value/focus surface this module uses. */
  return found as HTMLInputElement;
}

function text(form: HTMLFormElement, name: FieldName, max: number): string {
  return input(form, name).value.replace(/\s+/g, " ").trim().slice(0, max);
}

function paragraph(
  form: HTMLFormElement,
  name: FieldName,
  max: number,
): string {
  return tidyParagraph(input(form, name).value, max);
}

function whole(form: HTMLFormElement, name: FieldName): number | null {
  const raw = input(form, name).value.trim();
  if (raw === "") {
    return null;
  }
  const value = Number(raw);
  return Number.isInteger(value) ? value : NaN;
}

interface Problem {
  field: FieldName;
  message: string;
}

/* Returns the pitch to send, or the first problem to show. The browser's own
   checks (required, min, max) run first; these are the rules that span
   fields. The workflow repeats all of them, except that the photo loads,
   which only a browser can check. */
function readPitch(
  form: HTMLFormElement,
  photo: PhotoCheck,
): NewPitch | Problem {
  const today = todayIso();
  const place = text(form, "place", PITCH_LIMITS.place);
  const description = paragraph(form, "description", PITCH_LIMITS.description);
  const startDate = input(form, "startDate").value;
  const endDate = input(form, "endDate").value;
  const deadline = input(form, "deadline").value;
  const capacity = whole(form, "capacity");
  const threshold = whole(form, "threshold");
  const costEstimate = whole(form, "costEstimate");
  const url = text(form, "accommodationUrl", PITCH_LIMITS.accommodationUrl);
  const costIncludes = text(form, "costIncludes", PITCH_LIMITS.costIncludes);
  const image = input(form, "imageUrl").value.trim();
  const imageAlt = text(form, "imageAlt", PITCH_LIMITS.imageAlt);

  if (!place) {
    return { field: "place", message: "Add a place." };
  }
  if (!description) {
    return { field: "description", message: "Describe the plan." };
  }
  if (!startDate || startDate <= today) {
    return { field: "startDate", message: "Pick a start date in the future." };
  }
  if (!endDate || endDate < startDate) {
    return { field: "endDate", message: "The trip ends before it starts." };
  }
  /* Optional: empty means no limit, like a trip's capacity. */
  if (
    capacity !== null &&
    (Number.isNaN(capacity) ||
      capacity < PITCH_LIMITS.minPeople ||
      capacity > PITCH_LIMITS.maxPeople)
  ) {
    return {
      field: "capacity",
      message: `Group size must be between ${PITCH_LIMITS.minPeople} and ${PITCH_LIMITS.maxPeople}, or empty for no limit.`,
    };
  }
  /* Always required: it decides whether the trip goes ahead. */
  if (
    threshold === null ||
    Number.isNaN(threshold) ||
    threshold < PITCH_LIMITS.minPeople ||
    threshold > (capacity ?? PITCH_LIMITS.maxPeople)
  ) {
    return {
      field: "threshold",
      message:
        capacity === null
          ? `Interest needed must be between ${PITCH_LIMITS.minPeople} and ${PITCH_LIMITS.maxPeople}.`
          : `Interest needed must be between ${PITCH_LIMITS.minPeople} and the group size.`,
    };
  }
  if (!deadline || deadline < today || deadline >= startDate) {
    return {
      field: "deadline",
      message: "The deadline must be between today and the start date.",
    };
  }
  if (
    costEstimate !== null &&
    (Number.isNaN(costEstimate) ||
      costEstimate < 0 ||
      costEstimate > PITCH_LIMITS.maxCost)
  ) {
    return {
      field: "costEstimate",
      message: `Use a whole number of euros up to ${PITCH_LIMITS.maxCost}.`,
    };
  }
  if (url && !safeUrl(url)) {
    return {
      field: "accommodationUrl",
      message: "Use a full link starting with https://.",
    };
  }
  if (image) {
    if (!httpsUrl(image) || image.length > PITCH_LIMITS.imageUrl) {
      return {
        field: "imageUrl",
        message: "Use a photo link starting with https://.",
      };
    }
    if (photo.url !== image || photo.state === "loading") {
      return {
        field: "imageUrl",
        message: "The photo is still loading. Try again in a moment.",
      };
    }
    if (photo.state === "broken") {
      return { field: "imageUrl", message: PHOTO_BROKEN };
    }
    if (!imageAlt) {
      return {
        field: "imageAlt",
        message: "Describe the photo for people using a screen reader.",
      };
    }
  }

  return {
    place,
    startDate,
    endDate,
    description,
    accommodationUrl: url || null,
    /* A description without a photo describes nothing, so it is dropped. */
    imageUrl: image || null,
    imageAlt: image ? imageAlt : null,
    capacity,
    threshold,
    deadline,
    costEstimate,
    costIncludes: costIncludes || null,
  };
}

function renderForm(v: FormView): void {
  v.submit.disabled = v.busy;
  v.form.classList.toggle("is-busy", v.busy);
}

function renderPhoto(v: FormView): void {
  const { url, state } = v.photo;
  const src = state === "loaded" ? httpsUrl(url) : null;
  v.preview.hidden = src === null;
  if (src) {
    v.previewImage.src = src;
  } else {
    v.previewImage.removeAttribute("src");
  }
  v.photoStatus.textContent =
    state === "loading"
      ? "Checking the photo…"
      : state === "invalid"
        ? "Use a photo link starting with https://."
        : state === "broken"
          ? PHOTO_BROKEN
          : "";
}

/* Loads the link in the background, without a Referer like the cards,
   so a site that blocks hotlinking fails here rather than on the card.
   A result for a link that has since been edited is dropped. */
function checkPhoto(v: FormView): void {
  const url = input(v.form, "imageUrl").value.trim();
  if (url === v.photo.url) {
    return;
  }
  const src = url ? httpsUrl(url) : null;
  v.photo = { url, state: !url ? "none" : src ? "loading" : "invalid" };
  renderPhoto(v);
  if (!src) {
    return;
  }
  const probe = new Image();
  probe.referrerPolicy = "no-referrer";
  const settle = (state: PhotoState) => (): void => {
    if (v.photo.url === url) {
      v.photo = { url, state };
      renderPhoto(v);
    }
  };
  probe.addEventListener("load", settle("loaded"));
  probe.addEventListener("error", settle("broken"));
  probe.src = src;
}

async function submitPitch(v: FormView): Promise<void> {
  if (v.busy) {
    return;
  }
  /* Picks up a link typed or pasted just before submitting. */
  checkPhoto(v);
  const result = readPitch(v.form, v.photo);
  if ("field" in result) {
    v.status.textContent = result.message;
    input(v.form, result.field).focus();
    return;
  }

  /* Not optimistic, whether new or edited: there is nothing on this page to
     update. The form locks until the pitch is stored, then hands over to the
     list on /pitches. */
  v.busy = true;
  renderForm(v);
  const editing = v.editing;
  v.status.textContent = editing
    ? "Saving your changes…"
    : "Submitting your pitch…";
  try {
    if (editing) {
      await api.updatePitch({ pitchId: editing, ...result });
      v.status.textContent = "Changes saved. Taking you to the list…";
    } else {
      await api.createPitch(result);
      v.status.textContent = "Pitch submitted. Taking you to the list…";
    }
    location.assign(appPath("/pitches"));
  } catch (error) {
    v.busy = false;
    renderForm(v);
    v.status.textContent = describe(
      error,
      editing
        ? "Your changes could not be saved."
        : "Your pitch could not be submitted.",
    );
  }
}

/* Puts a stored pitch back into the form, the reverse of readPitch(). */
function fillForm(form: HTMLFormElement, pitch: Pitch): void {
  input(form, "place").value = pitch.place;
  input(form, "startDate").value = pitch.startDate;
  input(form, "endDate").value = pitch.endDate;
  input(form, "description").value = pitch.description;
  input(form, "capacity").value =
    pitch.capacity === null ? "" : String(pitch.capacity);
  input(form, "threshold").value = String(pitch.threshold);
  input(form, "deadline").value = pitch.deadline;
  input(form, "costEstimate").value =
    pitch.costEstimate === null ? "" : String(pitch.costEstimate);
  input(form, "costIncludes").value = pitch.costIncludes;
  input(form, "accommodationUrl").value = pitch.accommodationUrl;
  input(form, "imageUrl").value = pitch.imageUrl;
  input(form, "imageAlt").value = pitch.imageAlt;
}

/* Swaps the page's texts from "pitch a trip" to "edit your pitch". */
function showEditTexts(root: HTMLElement, v: FormView): void {
  document.title = "Edit your pitch — n8ncation";
  requireEl(root, "[data-pitch-title]").textContent = "Edit your pitch";
  requireEl(root, "[data-pitch-intro]").textContent =
    "Change anything about your pitch. Everyone who registered interest stays counted, so let them know about big changes such as new dates.";
  requireEl(root, "[data-pitch-back]").textContent = "Discard changes";
  v.submit.textContent = "Save changes";
}

export function mountPitchForm(root: HTMLElement): void {
  const form = requireEl(root, "form");
  const submit = requireEl(root, "button[type=submit]");
  if (
    !(form instanceof HTMLFormElement) ||
    !(submit instanceof HTMLButtonElement)
  ) {
    throw new Error("Expected the pitch form and its submit button");
  }

  /* Set here rather than in the markup, so the limits live in one place. */
  input(form, "place").maxLength = PITCH_LIMITS.place;
  input(form, "description").maxLength = PITCH_LIMITS.description;
  input(form, "costIncludes").maxLength = PITCH_LIMITS.costIncludes;
  input(form, "accommodationUrl").maxLength = PITCH_LIMITS.accommodationUrl;
  input(form, "imageUrl").maxLength = PITCH_LIMITS.imageUrl;
  input(form, "imageAlt").maxLength = PITCH_LIMITS.imageAlt;
  for (const name of ["capacity", "threshold"] as const) {
    input(form, name).min = String(PITCH_LIMITS.minPeople);
    input(form, name).max = String(PITCH_LIMITS.maxPeople);
  }
  input(form, "costEstimate").max = String(PITCH_LIMITS.maxCost);
  const today = todayIso();
  input(form, "startDate").min = today;
  input(form, "endDate").min = today;
  input(form, "deadline").min = today;

  const v: FormView = {
    form,
    submit,
    status: requireEl(root, "[data-pitch-status]"),
    busy: false,
    editing: new URLSearchParams(location.search).get("edit"),
    photo: { url: "", state: "none" },
    preview: requireEl(root, "[data-pitch-preview]"),
    previewImage: image(root, "[data-pitch-preview] img"),
    photoStatus: requireEl(root, "[data-pitch-photo-status]"),
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitPitch(v);
  });
  /* Checked once typing pauses, and right away on paste or leaving the
     field (change). */
  let photoTimer: number | undefined;
  const photoField = input(form, "imageUrl");
  photoField.addEventListener("input", () => {
    window.clearTimeout(photoTimer);
    photoTimer = window.setTimeout(() => {
      checkPhoto(v);
    }, 400);
  });
  photoField.addEventListener("change", () => {
    window.clearTimeout(photoTimer);
    checkPhoto(v);
  });
  renderForm(v);

  if (v.editing) {
    void revealForEditing(root, v, v.editing);
  } else {
    void revealWhenVerified(root);
  }
}

/* The stored session is only decoded in the browser, never verified, and
   this page needs no data, so nothing else would ever check it. GET /me is
   the cheapest authenticated call: n8n's JWT Auth verifies the token, and
   the page shows only once it has. */
async function revealWhenVerified(root: HTMLElement): Promise<void> {
  const state = requireEl(root, "[data-pitch-state]");
  const body = requireEl(root, "[data-pitch-body]");
  try {
    await api.getMe();
  } catch (error) {
    state.textContent = describe(error, "Your session could not be checked.");
    return;
  }
  state.hidden = true;
  body.hidden = false;
}

/* Editing does need data, the pitch itself, so GET /pitches is both the load
   and the session check. There is no single-pitch route: the list is small
   and already says which pitches are the caller's. The form only shows for
   an open pitch the caller organizes; POST /pitch-update checks the same
   thing again. */
async function revealForEditing(
  root: HTMLElement,
  v: FormView,
  pitchId: string,
): Promise<void> {
  const state = requireEl(root, "[data-pitch-state]");
  const body = requireEl(root, "[data-pitch-body]");
  state.textContent = "Loading your pitch…";
  let pitches: Pitch[];
  try {
    ({ pitches } = await api.getPitches());
  } catch (error) {
    state.textContent = describe(error, "Your pitch could not be loaded.");
    return;
  }
  const pitch = pitches.find(
    (candidate) =>
      candidate.pitchId === pitchId &&
      candidate.organizedByMe &&
      candidate.status === "open",
  );
  if (!pitch) {
    state.textContent = "You can only edit an open pitch you submitted.";
    return;
  }
  fillForm(v.form, pitch);
  checkPhoto(v);
  showEditTexts(root, v);
  state.hidden = true;
  body.hidden = false;
}
