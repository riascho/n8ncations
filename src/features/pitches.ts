/* Pitches: trips anyone can propose, which go ahead only with enough
   interest.

   - Home, #pitches: one card per open pitch, with an "I'm interested"
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
import { appPath } from "../paths";

/* Limits shared with the validation in the /pitch, /pitch-update and
   /pitch-cancel workflows. Change them together. */
export const PITCH_LIMITS = {
  place: 60,
  description: 600,
  costIncludes: 200,
  accommodationUrl: 500,
  cancelReason: 300,
  minPeople: 2,
  maxPeople: 100,
  maxCost: 10000,
} as const;

const euros = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

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

/* Only http(s) links become hrefs. A pitch is typed by a colleague, and a
   javascript: URL in an href would run on click. */
function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** The organizer's edit form for one pitch, linked from its card and /me. */
function editPath(pitchId: string): string {
  return `${appPath("/pitch")}?${new URLSearchParams({ edit: pitchId })}`;
}

/* ----------------------------------------------------------------
   Cards, home page
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

function buildPitchCard(pitch: Pitch): HTMLElement {
  const card = template("pitch-template");

  const titleId = `pitch-${pitch.pitchId}-title`;
  const heading = requireEl(card, ".pitch-place");
  heading.id = titleId;
  card.setAttribute("aria-labelledby", titleId);

  /* textContent throughout: every field was typed by whoever pitched it. */
  heading.textContent = pitch.place;
  renderDateRange(
    requireEl(card, ".pitch-dates"),
    pitch.startDate,
    pitch.endDate,
  );
  requireEl(card, ".pitch-description").textContent = pitch.description;
  requireEl(card, ".pitch-capacity").textContent = `Up to ${pitch.capacity}`;

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
  if (a.status !== b.status) {
    return a.status === "open" ? -1 : 1;
  }
  const left = parseDate(a.deadline);
  const right = parseDate(b.deadline);
  if (!left || !right) {
    return 0;
  }
  return ordinal(left) - ordinal(right);
}

export async function mountPitches(slot: HTMLElement): Promise<void> {
  const state = slot.querySelector("[data-pitches-state]");
  let pitches: Pitch[];
  try {
    ({ pitches } = await api.getPitches());
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

   The same compact rows as "your trips" on that page. Built from GET
   /pitches, so it lists what that route returns: your open pitches, and
   cancelled ones until their deadline. A confirmed pitch shows up under
   your trips instead, since you're signed up for it.
   ---------------------------------------------------------------- */

function buildMyPitchRow(pitch: Pitch): HTMLElement {
  const row = template("my-pitch-template");
  const link = requireEl(row, ".my-trip");
  /* textContent throughout: the organizer typed all of it. */
  requireEl(row, ".my-trip-title").textContent = pitch.place;
  const dates = document.createElement("span");
  renderDateRange(dates, pitch.startDate, pitch.endDate);
  const meta = requireEl(row, ".my-trip-meta");
  const action = requireEl(row, ".my-pitch-action");

  if (pitch.status === "cancelled") {
    /* No href: nothing left to edit, so the row is not a link. */
    link.classList.add("is-static");
    meta.append(dates, ` · Cancelled: ${pitch.cancelReason}`);
    action.remove();
  } else {
    link.setAttribute("href", editPath(pitch.pitchId));
    meta.append(
      dates,
      ` · ${progressText(pitch)} · Closes ${formatDay(pitch.deadline)}`,
    );
    action.textContent = "Edit";
  }
  return row;
}

export function renderMyPitches(slot: HTMLElement, pitches: Pitch[]): void {
  const mine = pitches.filter((pitch) => pitch.organizedByMe).sort(byDeadline);
  slot.replaceChildren();
  if (mine.length === 0) {
    const none = document.createElement("p");
    none.className = "trip-state";
    none.textContent = "You haven’t pitched an n8ncation yet.";
    slot.appendChild(none);
    return;
  }
  const list = document.createElement("ul");
  list.className = "my-trips";
  for (const pitch of mine) {
    list.appendChild(buildMyPitchRow(pitch));
  }
  slot.appendChild(list);
}

/* ----------------------------------------------------------------
   Pitch form, /pitch
   ---------------------------------------------------------------- */

type FieldName = keyof NewPitch;

interface FormView {
  form: HTMLFormElement;
  submit: HTMLButtonElement;
  status: HTMLElement;
  busy: boolean;
  /** The pitch being edited, from ?edit=, or null for a new pitch. */
  editing: string | null;
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
   fields. The workflow repeats all of them. */
function readPitch(form: HTMLFormElement): NewPitch | Problem {
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
  if (
    capacity === null ||
    Number.isNaN(capacity) ||
    capacity < PITCH_LIMITS.minPeople ||
    capacity > PITCH_LIMITS.maxPeople
  ) {
    return {
      field: "capacity",
      message: `Group size must be between ${PITCH_LIMITS.minPeople} and ${PITCH_LIMITS.maxPeople}.`,
    };
  }
  if (
    threshold === null ||
    Number.isNaN(threshold) ||
    threshold < PITCH_LIMITS.minPeople ||
    threshold > capacity
  ) {
    return {
      field: "threshold",
      message: `Interest needed must be between ${PITCH_LIMITS.minPeople} and the group size.`,
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

  return {
    place,
    startDate,
    endDate,
    description,
    accommodationUrl: url || null,
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

async function submitPitch(v: FormView): Promise<void> {
  if (v.busy) {
    return;
  }
  const result = readPitch(v.form);
  if ("field" in result) {
    v.status.textContent = result.message;
    input(v.form, result.field).focus();
    return;
  }

  /* Not optimistic, whether new or edited: there is nothing on this page to
     update. The form locks until the pitch is stored, then hands over to the
     list on home. */
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
    location.assign(`${appPath("/")}#pitches`);
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
  input(form, "capacity").value = String(pitch.capacity);
  input(form, "threshold").value = String(pitch.threshold);
  input(form, "deadline").value = pitch.deadline;
  input(form, "costEstimate").value =
    pitch.costEstimate === null ? "" : String(pitch.costEstimate);
  input(form, "costIncludes").value = pitch.costIncludes;
  input(form, "accommodationUrl").value = pitch.accommodationUrl;
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
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitPitch(v);
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
  showEditTexts(root, v);
  state.hidden = true;
  body.hidden = false;
}
