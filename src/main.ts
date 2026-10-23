import "./styles/tokens.css";
import "./styles/styles.css";

import {
  beginLogin,
  consumeRedirect,
  getUser,
  isOAuthPopup,
  isSignedIn,
  relayToOpener,
  signInAsDemo,
  signOut,
  takeReturnPath,
} from "./auth";
import { mountPolls, refresh } from "./features/polls";
import { clearProfile, mountProfile, showProfile } from "./features/profile";
import {
  mountWorkationDetail,
  mountWorkations,
  refreshRsvp,
  renderMyWorkations,
} from "./features/workations";
import * as api from "./api/client";
import { ApiError } from "./api/types";

const { usingMock } = api;

/* index.html holds the markup for every view, so the hooks alone do not say
   which page this is. The view was chosen once, before paint, by the inline
   script in index.html; everything here reads it rather than matching the
   path again. */
const view = document.documentElement.dataset["view"] ?? "home";

function el<T extends HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

/* Everything that depends on who is signed in. Each call is a no-op on a page
   that never mounted the thing it refreshes. */
function onAuthChange(): void {
  void refresh();
  void refreshRsvp();
  void loadMe();
}

/* Bumped on every /me load, so a response that lands after a sign-out — or
   after a newer load — is dropped instead of putting an email address back
   on screen. */
let meLoad = 0;

/* /me needs two responses: your own state from GET /me, and the trip details
   from GET /workations, which me.signups ids are matched against. Fetched
   here, once and in parallel, because both the profile card and the trip
   list use them and feature modules cannot share data with each other. */
async function loadMe(): Promise<void> {
  if (view !== "me") {
    return;
  }
  const state = el("[data-me-state]");
  const upcoming = el("[data-my-upcoming]");
  const past = el("[data-my-past]");
  const sections = document.querySelectorAll<HTMLElement>("[data-my-trips]");
  if (!state || !upcoming || !past) {
    return;
  }

  const ticket = ++meLoad;
  const showState = (message: string): void => {
    state.textContent = message;
    state.hidden = message === "";
  };
  const showNothing = (message: string): void => {
    clearProfile();
    upcoming.replaceChildren();
    past.replaceChildren();
    for (const section of sections) {
      section.hidden = true;
    }
    showState(message);
  };

  if (!isSignedIn()) {
    showNothing("Sign in with your n8n account to see your profile.");
    return;
  }

  showState("Loading your profile…");
  try {
    const [me, { workations }] = await Promise.all([
      api.getMe(),
      api.getWorkations(),
    ]);
    if (ticket !== meLoad) {
      return;
    }
    showState("");
    showProfile(me);
    renderMyWorkations(upcoming, past, workations, me.signups);
    for (const section of sections) {
      section.hidden = false;
    }
  } catch (error) {
    if (ticket !== meLoad) {
      return;
    }
    showNothing(
      error instanceof ApiError
        ? error.message
        : "Your profile could not be loaded.",
    );
  }
}

function renderAuth(): void {
  const slot = el("[data-auth]");
  if (!slot) {
    return;
  }
  slot.replaceChildren();
  const user = getUser();

  if (!user) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "auth-button";
    /* Without an API base there is no callback webhook to come back from, so
       the real Google round trip cannot complete. Mint a local session
       instead, so the polls are still driveable. */
    button.textContent = usingMock ? "Sign in (demo)" : "Sign in";
    button.addEventListener("click", () => {
      if (usingMock) {
        try {
          signInAsDemo();
          renderAuth();
          onAuthChange();
        } catch (error) {
          notify(error instanceof Error ? error.message : "Sign-in failed.");
        }
        return;
      }

      notify("");
      button.disabled = true;
      beginLogin()
        .then(() => {
          notify("");
          renderAuth();
          onAuthChange();
        })
        .catch((error: unknown) => {
          button.disabled = false;
          notify(error instanceof Error ? error.message : "Sign-in failed.");
        });
    });
    slot.appendChild(button);
    return;
  }

  /* The chip is the way to the profile page, so it is a real link: keyboard
     reachable, announced as a link, and it opens in a new tab like any
     other. */
  const chip = document.createElement("a");
  chip.className = "auth-user";
  chip.href = "/me";
  if (view === "me") {
    chip.setAttribute("aria-current", "page");
  }
  if (user.picture) {
    const avatar = document.createElement("img");
    avatar.className = "auth-avatar";
    avatar.src = user.picture;
    avatar.alt = "";
    avatar.width = 28;
    avatar.height = 28;
    avatar.referrerPolicy = "no-referrer";
    chip.appendChild(avatar);
  }
  const name = document.createElement("span");
  /* textContent: the name comes from a token payload we did not author. */
  name.textContent = user.name || user.email;
  chip.appendChild(name);
  /* Says where the link goes, while still containing the visible text so the
     accessible name matches it (WCAG 2.5.3). */
  chip.setAttribute("aria-label", `Your profile, ${name.textContent}`);

  const out = document.createElement("button");
  out.type = "button";
  out.className = "auth-button auth-button-quiet";
  out.textContent = "Sign out";
  out.addEventListener("click", () => {
    signOut();
    /* Signing out always lands on the main page. A full navigation rather
       than re-rendering in place: the next document boots signed out, so
       nothing personal — the email on /me, an RSVP highlight — survives from
       this one. On the main page itself there is nowhere to go, so it just
       re-renders. */
    if (view !== "home") {
      location.assign("/");
      return;
    }
    renderAuth();
    onAuthChange();
  });

  slot.append(chip, out);
}

function notify(message: string): void {
  const slot = el("[data-notice]");
  if (!slot) {
    return;
  }
  slot.textContent = message;
  slot.hidden = message === "";
}

function boot(): void {
  /* This document is the sign-in popup coming home: hand the result to the
     opener and close, without rendering or fetching anything. */
  if (isOAuthPopup()) {
    relayToOpener();
    return;
  }

  const outcome = consumeRedirect();
  /* Read on any return from Google, so a failed attempt cannot leave a stale
     path behind for the next one. */
  const returnPath = outcome.kind === "none" ? null : takeReturnPath();
  if (outcome.kind === "error") {
    /* Stay put rather than following returnPath: a reload would wipe the
       message explaining what went wrong. */
    notify(outcome.message);
  } else if (outcome.kind === "signed-in") {
    /* The popup-blocked fallback always comes back to the site root. Send the
       reader back to the trip they signed in from; the session is already
       stored, so the next document picks it up. */
    if (returnPath && returnPath !== location.pathname) {
      location.replace(returnPath);
      return;
    }
    notify("");
  }

  renderAuth();

  if (usingMock) {
    notify(
      "Demo data: VITE_API_BASE is not set, so votes and RSVPs are in-memory and reset on reload.",
    );
  }

  /* Mount only the current view: mounting on hooks alone would fetch polls
     behind a trip card. */
  if (view === "detail") {
    const detail = el("[data-detail]");
    if (detail) {
      void mountWorkationDetail(detail);
    }
    return;
  }

  if (view === "me") {
    document.title = "Your profile — n8ncation";
    const me = el("[data-me]");
    if (me) {
      mountProfile(me);
      void loadMe();
    }
    return;
  }

  const upcoming = el("[data-upcoming]");
  const past = el("[data-past]");
  const pastCount = el("[data-past-count]");
  if (upcoming && past && pastCount) {
    void mountWorkations(upcoming, past, pastCount);
  }

  const grid = el("[data-polls]");
  if (grid) {
    mountPolls(grid);
  }
}

boot();
