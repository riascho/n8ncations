/* Private logistics on the trip page, /n8ncation/<slug>.

   Two parts, both below the RSVP button:
   - "Your trip details": a form for your own dietary needs, room preference,
     travel times and emergency contact. Shown once you have a spot or a
     place on the waitlist, until the trip ends.
   - "Attendees": everyone signed up, with their logistics. Shown only to the
     trip's organizer (me.organizing), past trips included.

   The workflow enforces both rules; hiding the markup is only the UI side.
   This module does not know the RSVP state itself: workations.ts reports it
   through main.ts via showLogistics(), since feature modules must not import
   each other. */

import * as api from "../api/client";
import { ApiError } from "../api/types";
import type {
  Logistics,
  RosterEntry,
  SignupStatus,
  Workation,
} from "../api/types";
import { formatDateTime } from "../dates";
import { requireEl } from "../dom";

/* Data Table String columns carry no length limit of their own, so the cap is
   ours, and the workflow applies the same one. */
const MAX_FIELD_LENGTH = 200;

/** The same fields as DetailState in workations.ts, passed on by main.ts. */
export interface LogisticsContext {
  trip: Workation;
  past: boolean;
  signup: SignupStatus | null;
  organizing: boolean;
}

interface FormView {
  root: HTMLElement;
  form: HTMLFormElement;
  fields: Record<keyof Logistics, HTMLInputElement>;
  save: HTMLButtonElement;
  status: HTMLElement;
  /** The trip the form is loaded for, or null before the first load. */
  workationId: string | null;
  loaded: boolean;
  busy: boolean;
}

interface RosterView {
  root: HTMLElement;
  summary: HTMLElement;
  state: HTMLElement;
  body: HTMLElement;
  table: HTMLElement;
}

let formView: FormView | null = null;
let rosterView: RosterView | null = null;

/* Bumped on every roster load, so a slow response cannot overwrite a newer
   one after the organizer changes their own RSVP. */
let rosterLoad = 0;

const FIELD_NAMES: (keyof Logistics)[] = [
  "dietary",
  "roomPreference",
  "arrival",
  "departure",
  "emergencyContact",
];

function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return fallback;
}

/* ----------------------------------------------------------------
   Your trip details
   ---------------------------------------------------------------- */

/* Collapses whitespace like the profile fields do, and stores an empty field
   as null so "cleared" and "never set" are one state. */
function tidy(value: string): string | null {
  const text = value.replace(/\s+/g, " ").trim().slice(0, MAX_FIELD_LENGTH);
  return text === "" ? null : text;
}

function readForm(v: FormView): Logistics {
  return {
    dietary: tidy(v.fields.dietary.value),
    roomPreference: tidy(v.fields.roomPreference.value),
    /* datetime-local values are already canonical, or "" when empty. */
    arrival: v.fields.arrival.value || null,
    departure: v.fields.departure.value || null,
    emergencyContact: tidy(v.fields.emergencyContact.value),
  };
}

function fillForm(v: FormView, logistics: Logistics | null): void {
  for (const name of FIELD_NAMES) {
    v.fields[name].value = logistics?.[name] ?? "";
  }
}

/* Editable only once a load has succeeded, as on the profile form: a failed
   fetch must not leave empty fields that Save would write over real ones. */
function renderForm(v: FormView): void {
  const editable = v.loaded && !v.busy;
  for (const name of FIELD_NAMES) {
    v.fields[name].disabled = !editable;
  }
  v.save.disabled = !editable;
  v.root.classList.toggle("is-busy", v.busy);
}

async function loadForm(v: FormView, workationId: string): Promise<void> {
  v.workationId = workationId;
  v.loaded = false;
  renderForm(v);
  v.status.textContent = "Loading your details…";
  try {
    const { mine } = await api.getLogistics(workationId);
    if (v.workationId !== workationId) {
      return;
    }
    fillForm(v, mine);
    v.loaded = true;
    v.status.textContent = "";
  } catch (error) {
    v.status.textContent = describe(error, "Your details could not be loaded.");
  }
  renderForm(v);
}

async function saveForm(v: FormView): Promise<void> {
  const workationId = v.workationId;
  if (v.busy || !v.loaded || !workationId) {
    return;
  }
  const logistics = readForm(v);
  /* Both are YYYY-MM-DDTHH:MM, so string order is time order. */
  if (
    logistics.arrival &&
    logistics.departure &&
    logistics.departure < logistics.arrival
  ) {
    v.status.textContent = "Your departure is before your arrival.";
    v.fields.departure.focus();
    return;
  }

  v.busy = true;
  renderForm(v);
  v.status.textContent = "Saving…";
  try {
    await api.saveLogistics(workationId, logistics);
    v.busy = false;
    /* Show what was stored, so a trimmed value is visible. */
    fillForm(v, logistics);
    v.status.textContent = "Saved. Only you and the organizer can see this.";
  } catch (error) {
    v.busy = false;
    v.status.textContent = describe(error, "Your details could not be saved.");
  }
  renderForm(v);
}

function showForm(v: FormView, context: LogisticsContext): void {
  const visible = !context.past && context.signup !== null;
  v.root.hidden = !visible;
  if (!visible) {
    /* Cancelling deletes the row on the server, so the next sign-up starts
       from an empty form rather than from stale values. */
    fillForm(v, null);
    v.workationId = null;
    v.loaded = false;
    v.status.textContent = "";
    renderForm(v);
    return;
  }
  if (v.workationId !== context.trip.workationId) {
    void loadForm(v, context.trip.workationId);
  }
}

/* ----------------------------------------------------------------
   Attendees, organizer only
   ---------------------------------------------------------------- */

function cell(text: string): HTMLTableCellElement {
  const td = document.createElement("td");
  /* textContent: everything here was typed by a colleague. */
  td.textContent = text || "—";
  return td;
}

function buildRosterRow(person: RosterEntry): HTMLTableRowElement {
  const row = document.createElement("tr");

  const who = document.createElement("th");
  who.scope = "row";
  const name = document.createElement("span");
  name.className = "roster-name";
  name.textContent = person.name || person.email;
  const email = document.createElement("a");
  email.className = "roster-email";
  email.href = `mailto:${person.email}`;
  email.textContent = person.email;
  who.append(name, email);

  const status =
    person.status === "going"
      ? "Going"
      : person.position === null
        ? "Waitlist"
        : `Waitlist #${person.position}`;
  const logistics = person.logistics;

  row.append(
    who,
    cell(person.team ?? ""),
    cell(status),
    cell(logistics?.dietary ?? ""),
    cell(logistics?.roomPreference ?? ""),
    cell(formatDateTime(logistics?.arrival ?? null)),
    cell(formatDateTime(logistics?.departure ?? null)),
    cell(logistics?.emergencyContact ?? ""),
  );
  return row;
}

function summaryText(people: RosterEntry[]): string {
  const going = people.filter((person) => person.status === "going").length;
  const waiting = people.length - going;
  const text = `${going} going`;
  return waiting > 0 ? `${text} · ${waiting} on the waitlist` : text;
}

async function loadRoster(v: RosterView, workationId: string): Promise<void> {
  const ticket = ++rosterLoad;
  v.state.textContent = "Loading attendees…";
  v.state.hidden = false;
  try {
    const { people } = await api.getRoster(workationId);
    if (ticket !== rosterLoad) {
      return;
    }
    v.body.replaceChildren(...people.map(buildRosterRow));
    v.summary.textContent = summaryText(people);
    v.table.hidden = people.length === 0;
    v.state.textContent =
      people.length === 0 ? "No one has signed up yet." : "";
    v.state.hidden = people.length > 0;
  } catch (error) {
    if (ticket !== rosterLoad) {
      return;
    }
    v.table.hidden = true;
    v.state.textContent = describe(
      error,
      "The attendee list could not be loaded.",
    );
  }
}

/* ----------------------------------------------------------------
   Public surface
   ---------------------------------------------------------------- */

export function mountLogistics(
  formRoot: HTMLElement,
  rosterRoot: HTMLElement,
): void {
  const form = requireEl(formRoot, "form");
  if (!(form instanceof HTMLFormElement)) {
    throw new Error("Expected the logistics form to be a <form>");
  }
  const fields = {} as Record<keyof Logistics, HTMLInputElement>;
  for (const name of FIELD_NAMES) {
    const input = form.elements.namedItem(name);
    if (!(input instanceof HTMLInputElement)) {
      throw new Error(`Expected a logistics input named ${name}`);
    }
    if (input.type === "text") {
      /* Set here rather than in the markup, so the cap and tidy() agree. */
      input.maxLength = MAX_FIELD_LENGTH;
    }
    fields[name] = input;
  }
  const save = requireEl(form, "button[type=submit]");
  if (!(save instanceof HTMLButtonElement)) {
    throw new Error("Expected the logistics Save button");
  }

  const v: FormView = {
    root: formRoot,
    form,
    fields,
    save,
    status: requireEl(formRoot, "[data-logistics-status]"),
    workationId: null,
    loaded: false,
    busy: false,
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveForm(v);
  });
  renderForm(v);
  formView = v;

  rosterView = {
    root: rosterRoot,
    summary: requireEl(rosterRoot, "[data-roster-summary]"),
    state: requireEl(rosterRoot, "[data-roster-state]"),
    body: requireEl(rosterRoot, "tbody"),
    table: requireEl(rosterRoot, "[data-roster-table]"),
  };
}

/** Called by main.ts whenever the reader's RSVP state on the trip changes. */
export function showLogistics(context: LogisticsContext): void {
  if (formView) {
    showForm(formView, context);
  }
  const roster = rosterView;
  if (roster) {
    roster.root.hidden = !context.organizing;
    if (context.organizing) {
      void loadRoster(roster, context.trip.workationId);
    }
  }
}
