/* Poll voting.

   The --pct custom property drives the bar width, each option carries
   aria-pressed, an aria-label carries the raw tally that the bar only
   implies, and option labels are set with textContent because the value is
   whatever somebody typed.

   Counts come from n8n, so a vote is an async write. Each click applies
   optimistically and rolls back if the request
   fails, and the card locks while a write is in flight — n8n's Data Table
   upsert is a non-atomic "update, else insert", so two overlapping writes for
   the same person can both insert. */

import { MAX_SUGGESTION_LENGTH, POLLS } from "../data/polls";
import type { PollConfig } from "../data/polls";
import * as api from "../api/client";
import { ApiError } from "../api/types";
import type { PollResult } from "../api/types";
import { isSignedIn } from "../auth";
import { requireEl, template } from "../dom";

interface PollView {
  config: PollConfig;
  card: HTMLElement;
  list: HTMLElement;
  status: HTMLElement;
  meta: HTMLElement;
  /** Ordered option values, seeds first, then anything suggested. */
  values: string[];
  counts: Map<string, number>;
  voters: number;
  mine: Set<string>;
  busy: boolean;
  /** Bumped whenever a write starts or settles. refresh() compares it across
      its awaits to tell whether its server data is older than local state. */
  edits: number;
}

interface Snapshot {
  counts: Map<string, number>;
  voters: number;
  mine: Set<string>;
}

const views = new Map<string, PollView>();

/* The grid and the line shown in its place until the first GET /polls
   succeeds. The cards are built from the bundled config, so revealing them
   only after a verified response keeps them behind n8n's session check. */
let gridRoot: HTMLElement | null = null;
let gridState: HTMLElement | null = null;

/* ----------------------------------------------------------------
   Small helpers
   ---------------------------------------------------------------- */

function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function matchKey(text: string): string {
  return tidy(text).toLowerCase();
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function people(count: number): string {
  return count === 1 ? "1 person" : `${count} people`;
}

/* ----------------------------------------------------------------
   Building the cards
   ---------------------------------------------------------------- */

function buildOption(view: PollView, value: string): void {
  const row = template("poll-option-template");
  const button = requireEl(row, ".poll-option");
  button.dataset["value"] = value;
  /* textContent, never innerHTML: `value` is whatever somebody typed. */
  requireEl(button, ".poll-label").textContent = value;
  view.list.appendChild(row);
}

function createCard(config: PollConfig): PollView {
  const card = template("poll-template");
  card.dataset["poll"] = config.id;

  const titleId = `poll-${config.id}-title`;
  const question = requireEl(card, ".poll-question");
  question.id = titleId;
  question.textContent = config.question;
  card.setAttribute("aria-labelledby", titleId);

  requireEl(card, ".poll-hint").textContent = config.hint;

  const list = requireEl(card, ".poll-options");
  if (config.split) {
    list.classList.add("poll-options-split");
  }

  const suggest = card.querySelector(".poll-suggest");
  if (config.allowSuggestions && suggest instanceof HTMLFormElement) {
    const input = requireEl(suggest, "input");
    const label = requireEl(suggest, ".poll-suggest-label");
    const inputId = `poll-${config.id}-suggestion`;
    input.id = inputId;
    input.setAttribute("maxlength", String(MAX_SUGGESTION_LENGTH));
    if (config.suggestPlaceholder) {
      input.setAttribute("placeholder", config.suggestPlaceholder);
    }
    label.setAttribute("for", inputId);
    label.textContent = config.suggestLabel ?? "";
  } else {
    suggest?.remove();
  }

  const view: PollView = {
    config,
    card,
    list,
    status: requireEl(card, "[data-poll-status]"),
    meta: requireEl(card, "[data-poll-meta]"),
    values: [...config.seedOptions],
    counts: new Map(),
    voters: 0,
    mine: new Set(),
    busy: false,
    edits: 0,
  };

  for (const value of view.values) {
    buildOption(view, value);
  }
  return view;
}

/* ----------------------------------------------------------------
   Rendering
   ---------------------------------------------------------------- */

function render(view: PollView): void {
  const buttons = view.list.querySelectorAll<HTMLButtonElement>(".poll-option");

  for (const button of buttons) {
    const value = button.dataset["value"] ?? "";
    const count = view.counts.get(value) ?? 0;
    /* Share of people, not share of selections: in a multi-select poll the
       useful number is "8 of 12 could make June", and for a single-choice
       poll the two are identical anyway. */
    const percent =
      view.voters > 0 ? Math.round((count / view.voters) * 100) : 0;
    const chosen = view.mine.has(value);

    /* The bar keeps the proportion; the number shown is the head count. With
       a handful of colleagues voting, "3" says more than "75%" does. */
    button.style.setProperty("--pct", `${percent}%`);
    button.setAttribute("aria-pressed", chosen ? "true" : "false");
    button.disabled = view.busy;
    requireEl(button, ".poll-count").textContent = String(count);

    /* Screen readers get the raw tally, which the bar only implies. */
    const tally =
      view.config.mode === "multi"
        ? `${count} of ${people(view.voters)}`
        : plural(count, "vote");
    const yours = chosen
      ? view.config.mode === "multi"
        ? ", your pick"
        : ", your vote"
      : "";
    button.setAttribute("aria-label", `${value} — ${tally}${yours}`);
  }

  view.card.classList.toggle("is-voted", view.mine.size > 0);
  view.card.classList.toggle("is-busy", view.busy);
  view.meta.textContent =
    view.voters === 0
      ? "No votes yet — be the first"
      : `${people(view.voters)} voted so far`;
}

function say(view: PollView, message: string): void {
  view.status.textContent = message;
}

/* ----------------------------------------------------------------
   Voting
   ---------------------------------------------------------------- */

function snapshot(view: PollView): Snapshot {
  return {
    counts: new Map(view.counts),
    voters: view.voters,
    mine: new Set(view.mine),
  };
}

function restore(view: PollView, saved: Snapshot): void {
  view.counts = saved.counts;
  view.voters = saved.voters;
  view.mine = saved.mine;
}

function bump(view: PollView, value: string, by: number): void {
  view.counts.set(value, Math.max(0, (view.counts.get(value) ?? 0) + by));
}

/** Applies a new selection locally, keeping counts and the voter total in step. */
function applySelection(view: PollView, next: Set<string>): void {
  const wasVoter = view.mine.size > 0;
  for (const value of view.mine) {
    if (!next.has(value)) {
      bump(view, value, -1);
    }
  }
  for (const value of next) {
    if (!view.mine.has(value)) {
      bump(view, value, 1);
    }
  }
  if (!wasVoter && next.size > 0) {
    view.voters += 1;
  } else if (wasVoter && next.size === 0) {
    view.voters -= 1;
  }
  view.mine = next;
}

function nextSelection(view: PollView, value: string): Set<string> {
  if (view.config.mode === "single") {
    /* Tapping your current pick again clears it, so a vote is retractable. */
    return view.mine.has(value) ? new Set() : new Set([value]);
  }
  const next = new Set(view.mine);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

async function vote(view: PollView, value: string): Promise<void> {
  if (view.busy) {
    return;
  }
  if (!isSignedIn()) {
    say(view, "Sign in with your n8n account to vote.");
    return;
  }

  const saved = snapshot(view);
  applySelection(view, nextSelection(view, value));
  view.busy = true;
  /* Bumped here and again once the write settles, so any refresh() that
     overlaps any part of the write sees a change and keeps its hands off:
     a GET /me read while this POST is in flight may predate it. */
  view.edits += 1;
  render(view);

  try {
    await api.castVote(view.config.id, [...view.mine]);
    view.busy = false;
    view.edits += 1;
    render(view);
  } catch (error) {
    restore(view, saved);
    view.busy = false;
    view.edits += 1;
    render(view);
    say(view, describe(error, "Your vote could not be saved."));
  }
  maybeResync();
}

function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return fallback;
}

/* ----------------------------------------------------------------
   Free-text suggestions
   ---------------------------------------------------------------- */

async function addSuggestion(view: PollView, raw: string): Promise<void> {
  if (view.busy) {
    return;
  }
  const label = tidy(tidy(raw).slice(0, MAX_SUGGESTION_LENGTH));
  if (!label) {
    say(view, "Type a place first.");
    return;
  }
  if (!isSignedIn()) {
    say(view, "Sign in with your n8n account to add a place.");
    return;
  }

  const existing = view.values.find(
    (value) => matchKey(value) === matchKey(label),
  );
  if (existing) {
    /* vote() toggles, so calling it on a place you already picked would take
       your vote off it — the opposite of what the message promises. */
    if (view.mine.has(existing)) {
      say(view, `“${existing}” is already on the list and has your vote.`);
      return;
    }
    say(
      view,
      `“${existing}” is already on the list — putting your vote on it.`,
    );
    await vote(view, existing);
    return;
  }

  view.busy = true;
  render(view);
  try {
    await api.addPollOption(view.config.id, label);
    view.values.push(label);
    buildOption(view, label);
    view.busy = false;
    say(view, `“${label}” added — anyone can vote on it now.`);
    await vote(view, label);
  } catch (error) {
    view.busy = false;
    render(view);
    say(view, describe(error, `“${label}” could not be added.`));
    maybeResync();
  }
}

/* ----------------------------------------------------------------
   Loading server state
   ---------------------------------------------------------------- */

/* `withCounts` is false when the reader voted while this response was in
   flight: the tallies may predate their vote. New options are safe either
   way, since adding one cannot undo anything. */
function applyResults(
  view: PollView,
  result: PollResult,
  withCounts: boolean,
): void {
  if (withCounts) {
    view.voters = result.voters;
    view.counts = new Map(result.options.map((o) => [o.value, o.count]));
  }

  /* Options somebody else suggested since the page was built. */
  for (const option of result.options) {
    if (!view.values.includes(option.value)) {
      view.values.push(option.value);
      buildOption(view, option.value);
    }
  }
}

async function refresh(): Promise<void> {
  /* Nothing to fill before mountPolls() has built the cards. */
  if (views.size === 0) {
    return;
  }

  const signedIn = isSignedIn();

  /* Polls only mount once signed in, but the session can lapse before a
     resync. Run before the first await, so the highlights drop straight away
     instead of staying lit for a round trip. The tallies keep those votes —
     they just stop being marked as yours. */
  if (!signedIn) {
    for (const view of views.values()) {
      if (view.mine.size > 0) {
        view.mine = new Set();
        render(view);
      }
    }
  }

  /* Taken before the first await. A poll whose counter has moved by the time
     a response lands was voted on in the meantime, so that response may be
     older than what is on screen — and since a vote sends the whole
     selection, applying it would also make the next vote erase a pick on
     the server. Local state wins, as with any optimistic write; the next
     refresh brings the poll back in step. */
  const startedAt = new Map(
    [...views].map(([pollId, view]) => [pollId, view.edits]),
  );
  const untouched = (view: PollView): boolean =>
    !view.busy && view.edits === startedAt.get(view.config.id);

  try {
    try {
      const { polls } = await api.getPolls();
      if (gridRoot && gridState) {
        gridRoot.hidden = false;
        gridState.hidden = true;
      }
      for (const result of polls) {
        const view = views.get(result.pollId);
        if (view) {
          const fresh = untouched(view);
          applyResults(view, result, fresh);
          render(view);
          if (fresh) {
            /* Clears the "Loading results…" placeholder — but not a message
               from a vote that landed in the meantime. */
            say(view, "");
          }
        }
      }
      /* A poll the response left out has no results to show, but the fetch
         did finish, so it must not keep claiming to load. */
      const returned = new Set(polls.map((result) => result.pollId));
      for (const [pollId, view] of views) {
        if (!returned.has(pollId) && untouched(view)) {
          say(view, "");
        }
      }
    } catch (error) {
      for (const view of views.values()) {
        say(view, describe(error, "Results could not be loaded."));
      }
      /* Before the first success the cards are still hidden, so the message
         goes where they would be. */
      if (gridRoot?.hidden && gridState) {
        gridState.textContent = describe(
          error,
          "The polls could not be loaded.",
        );
      }
      return;
    }

    if (!signedIn) {
      return;
    }
    try {
      const me = await api.getMe();
      for (const [pollId, selected] of Object.entries(me.votes)) {
        const view = views.get(pollId);
        if (view && untouched(view)) {
          view.mine = new Set(selected);
          render(view);
        }
      }
    } catch (error) {
      if (error instanceof ApiError && error.isAuthFailure) {
        /* Session lapsed between the two reads; leave the tallies on screen. */
        return;
      }
    }
  } finally {
    /* Skipping leaves optimistic tallies on screen — on first load, counts
       built on an empty baseline. Fetch again once the writes have settled,
       when the server already includes them. */
    if ([...views.values()].some((view) => !untouched(view))) {
      resyncPending = true;
      maybeResync();
    }
  }
}

/* Set when a refresh had to skip a poll. At most one follow-up per skip, and
   only once nothing is in flight — a refresh during a write would just skip
   again, and the frontend should stay un-chatty towards n8n. */
let resyncPending = false;

/* Called when a refresh skipped something, and whenever a vote settles. */
function maybeResync(): void {
  if (!resyncPending || [...views.values()].some((view) => view.busy)) {
    return;
  }
  resyncPending = false;
  void refresh();
}

export function mountPolls(root: HTMLElement, state: HTMLElement): void {
  gridRoot = root;
  gridState = state;
  for (const config of POLLS) {
    const view = createCard(config);
    views.set(config.id, view);
    root.appendChild(view.card);
    render(view);
    say(view, "Loading results…");
  }

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest<HTMLElement>(".poll-option");
    const card = button?.closest<HTMLElement>("[data-poll]");
    const view = card?.dataset["poll"]
      ? views.get(card.dataset["poll"])
      : undefined;
    if (button && view) {
      /* Cleared here rather than inside vote(), so that vote() cannot wipe a
         message its caller just set — the duplicate-suggestion hint did
         exactly that. */
      say(view, "");
      void vote(view, button.dataset["value"] ?? "");
    }
  });

  root.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches(".poll-suggest")) {
      return;
    }
    event.preventDefault();
    const card = form.closest<HTMLElement>("[data-poll]");
    const view = card?.dataset["poll"]
      ? views.get(card.dataset["poll"])
      : undefined;
    const input = form.querySelector("input");
    if (view && input instanceof HTMLInputElement) {
      void addSuggestion(view, input.value);
      input.value = "";
    }
  });

  void refresh();
}
