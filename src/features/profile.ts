/* The profile page at /me: avatar, name, email, and the two fields a person
   owns themselves — team and job title.

   Name, email and picture are read-only here on purpose. They come from the
   Google account through the session JWT, and the callback workflow rewrites
   them in `profiles` on every sign-in, so an edit would not survive the next
   login.

   The markup lives in index.html; this module wires and fills it. It does not
   fetch /me itself: the trip list on the same page needs that response too,
   so main.ts loads it once per visit and hands it to showProfile(). Saving is
   the only request made from here. */

import * as api from "../api/client";
import { ApiError } from "../api/types";
import type { Me } from "../api/types";
import { requireEl } from "../dom";

/* Data Table String columns carry no length limit of their own, so the cap is
   ours. Long enough for "Developer Relations", short enough to sit on a
   workation card without wrapping. */
const MAX_FIELD_LENGTH = 60;

interface ProfileView {
  card: HTMLElement;
  avatar: HTMLElement;
  name: HTMLElement;
  email: HTMLElement;
  team: HTMLInputElement;
  jobTitle: HTMLInputElement;
  save: HTMLButtonElement;
  form: HTMLFormElement;
  status: HTMLElement;
  /** What the server last told us. Null until a load succeeds. */
  loaded: Me | null;
  busy: boolean;
}

let view: ProfileView | null = null;

/** requireEl, narrowed to a specific element type. */
function requireOf<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
  type: new () => T,
): T {
  const found = requireEl(root, selector);
  if (!(found instanceof type)) {
    throw new Error(`Expected ${selector} to be a ${type.name}`);
  }
  return found;
}

/* ----------------------------------------------------------------
   Rendering
   ---------------------------------------------------------------- */

function say(v: ProfileView, message: string): void {
  v.status.textContent = message;
}

function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return fallback;
}

/* Collapses runs of whitespace the same way the poll suggestions do, then
   treats an empty field as null so "cleared" and "never set" are one state. */
function tidy(value: string): string | null {
  const text = value.replace(/\s+/g, " ").trim().slice(0, MAX_FIELD_LENGTH);
  return text === "" ? null : text;
}

/* The form is editable only once a load has succeeded. Without that guard a
   failed fetch would leave two empty fields that Save would write over a real
   team and job title. */
function render(v: ProfileView): void {
  const editable = v.loaded !== null && !v.busy;
  v.team.disabled = !editable;
  v.jobTitle.disabled = !editable;
  v.save.disabled = !editable;
  v.card.classList.toggle("is-busy", v.busy);
}

function initials(name: string, email: string): string {
  const parts = (name.trim() || email.trim()).split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "";
  }
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

function fill(v: ProfileView, me: Me): void {
  /* textContent throughout: every one of these came from a token payload we
     did not author. */
  v.name.textContent = me.name || me.email;
  v.email.textContent = me.email;
  v.team.value = me.team ?? "";
  v.jobTitle.value = me.jobTitle ?? "";

  v.avatar.replaceChildren();
  if (me.picture) {
    const image = document.createElement("img");
    image.src = me.picture;
    image.alt = "";
    image.width = 64;
    image.height = 64;
    /* Google's avatar host rejects requests that carry a referrer. */
    image.referrerPolicy = "no-referrer";
    v.avatar.appendChild(image);
  } else {
    v.avatar.textContent = initials(me.name, me.email);
  }
}

/* ----------------------------------------------------------------
   Saving
   ---------------------------------------------------------------- */

async function save(v: ProfileView): Promise<void> {
  const base = v.loaded;
  if (v.busy || !base) {
    return;
  }

  const update = {
    team: tidy(v.team.value),
    jobTitle: tidy(v.jobTitle.value),
  };

  v.busy = true;
  render(v);
  say(v, "Saving…");

  try {
    await api.updateProfile(update);
    v.loaded = { ...base, ...update };
    v.busy = false;
    render(v);
    /* Show what was actually stored, so a trimmed value is visible rather than
       silently different from what is on screen. */
    v.team.value = update.team ?? "";
    v.jobTitle.value = update.jobTitle ?? "";
    say(v, "Saved.");
  } catch (error) {
    v.busy = false;
    render(v);
    say(v, describe(error, "Your profile could not be saved."));
  }
}

/* ----------------------------------------------------------------
   Public surface
   ---------------------------------------------------------------- */

/** Fills the card from a /me response and reveals it. */
export function showProfile(me: Me): void {
  const v = view;
  if (!v) {
    return;
  }
  v.loaded = me;
  v.busy = false;
  fill(v, me);
  render(v);
  say(v, "");
  v.card.hidden = false;
}

/* Hides the card and empties it. Used on sign-out and on a failed load: the
   card shows an email address, so it must not stay on a signed-out page, and
   hiding alone would leave the address in the DOM. */
export function clearProfile(): void {
  const v = view;
  if (!v) {
    return;
  }
  v.loaded = null;
  v.busy = false;
  v.card.hidden = true;
  v.name.textContent = "";
  v.email.textContent = "";
  v.avatar.replaceChildren();
  v.team.value = "";
  v.jobTitle.value = "";
  say(v, "");
  render(v);
}

export function mountProfile(root: HTMLElement): void {
  const card = requireEl(root, "[data-profile]");
  const team = requireOf(card, "#profile-team", HTMLInputElement);
  const jobTitle = requireOf(card, "#profile-job-title", HTMLInputElement);

  /* Set here rather than as maxlength in the markup, so the cap and the slice
     in tidy() cannot drift apart. */
  team.maxLength = MAX_FIELD_LENGTH;
  jobTitle.maxLength = MAX_FIELD_LENGTH;

  const v: ProfileView = {
    card,
    avatar: requireEl(card, ".profile-avatar"),
    name: requireEl(card, ".profile-name"),
    email: requireEl(card, ".profile-email"),
    team,
    jobTitle,
    save: requireOf(card, ".profile-save", HTMLButtonElement),
    form: requireOf(card, ".profile-form", HTMLFormElement),
    status: requireEl(card, ".profile-status"),
    loaded: null,
    busy: false,
  };

  v.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void save(v);
  });

  view = v;
  render(v);
}
