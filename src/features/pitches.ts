/* Pitches: trips anyone can propose, which go ahead only with enough
   interest.

   - Home, #pitches: one card per open pitch, with an "I'm interested"
     toggle and progress towards the pitch's threshold.
   - /pitch: the form to submit one. The person pitching becomes the
     organizer and counts as the first interested person.

   Nothing here confirms or expires a pitch. A scheduled n8n workflow does
   that once a day (see README → Pitches), so a confirmed pitch simply stops
   being listed here and shows up as a trip in GET /workations instead. */

import * as api from "../api/client";
import { ApiError } from "../api/types";
import type { NewPitch, Pitch } from "../api/types";
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

/* Limits shared with the workflow's validation. Change both together. */
export const PITCH_LIMITS = {
  place: 60,
  description: 600,
  costIncludes: 200,
  accommodationUrl: 500,
  minPeople: 2,
  maxPeople: 100,
  maxCost: 10000,
} as const;

const euros = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

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

/* ----------------------------------------------------------------
   Cards, home page
   ---------------------------------------------------------------- */

interface PitchView {
  root: HTMLElement;
  progress: HTMLElement;
  bar: HTMLElement;
  button: HTMLButtonElement;
  status: HTMLElement;
  pitch: Pitch;
  busy: boolean;
}

function progressText(pitch: Pitch): string {
  if (pitch.interested >= pitch.threshold) {
    return `${pitch.interested} interested · enough to go ahead`;
  }
  return `${pitch.interested} of ${pitch.threshold} interested`;
}

function renderPitch(v: PitchView): void {
  const { pitch } = v;
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

function buildPitchCard(pitch: Pitch): HTMLElement {
  const card = template("pitch-template");

  const titleId = `pitch-${pitch.pitchId}-title`;
  const heading = requireEl(card, ".pitch-place");
  heading.id = titleId;
  card.setAttribute("aria-labelledby", titleId);

  /* textContent throughout: every field was typed by whoever pitched it. */
  heading.textContent = pitch.place;
  requireEl(card, ".pitch-deadline").textContent =
    `Closes ${formatDay(pitch.deadline)}`;
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

  const button = requireEl(card, ".pitch-button");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Expected .pitch-button to be a <button>");
  }
  const view: PitchView = {
    root: card,
    progress: requireEl(card, ".pitch-progress-text"),
    bar: requireEl(card, ".pitch-bar"),
    button,
    status: requireEl(card, ".pitch-status"),
    pitch,
    busy: false,
  };
  renderPitch(view);
  button.addEventListener("click", () => {
    view.status.textContent = "";
    void toggleInterest(view);
  });
  return card;
}

/** Deadline first: the pitch that closes soonest needs attention first. */
function byDeadline(a: Pitch, b: Pitch): number {
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
  if (pitches.length === 0) {
    const none = document.createElement("p");
    none.className = "trip-state";
    none.textContent = "No open pitches right now. Have an idea? Pitch it.";
    slot.appendChild(none);
    return;
  }
  for (const pitch of [...pitches].sort(byDeadline)) {
    slot.appendChild(buildPitchCard(pitch));
  }
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

/* The description keeps its line breaks, unlike the one-line fields. */
function paragraph(
  form: HTMLFormElement,
  name: FieldName,
  max: number,
): string {
  return input(form, name)
    .value.replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
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

  /* Not optimistic: there is nothing on this page to update. The form locks
     until the pitch is stored, then hands over to the list on home. */
  v.busy = true;
  renderForm(v);
  v.status.textContent = "Submitting your pitch…";
  try {
    await api.createPitch(result);
    v.status.textContent = "Pitch submitted. Taking you to the list…";
    location.assign(`${appPath("/")}#pitches`);
  } catch (error) {
    v.busy = false;
    renderForm(v);
    v.status.textContent = describe(
      error,
      "Your pitch could not be submitted.",
    );
  }
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
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitPitch(v);
  });
  renderForm(v);

  void revealWhenVerified(root);
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
