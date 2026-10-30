/* "Get involved" on the home page: three cards in a row, with live numbers
   from the API.

   1. Organize your own trip: the pink lead card.
   2. Join a trip: confirmed n8ncations to RSVP to and pitches to back, which
      share one page on /workations.
   3. Vote: the most-voted places and months, set large over the dot grid,
      so a pitch can start from what people want.

   Signed-in only, like everything that loads data. main.ts mounts this from
   mountView(), and the section stays hidden until at least one of its three
   requests has succeeded, so nothing shows before n8n has checked the
   session. */

import * as api from "../api/client";
import type {
  PitchesResponse,
  PollsResponse,
  WorkationsResponse,
} from "../api/types";
import { isSignedIn } from "../auth";
import { ordinal, parseDate, todayIso, todayOrdinal } from "../dates";
import { requireEl, template } from "../dom";
import { appPath } from "../paths";
import { topPicks, voterCount } from "../poll-picks";

interface Link {
  label: string;
  path: string;
}

/** "accent" is the pink lead card; "vote" sits on the dot grid. */
type Variant = "accent" | "plain" | "vote";

interface Card {
  variant: Variant;
  label: string;
  title: string;
  body: string;
  /** The line with the live numbers, or "" when its requests failed. */
  live: string;
  /** Lines set large under "Most votes so far". Empty hides the block. */
  picks?: string[];
  cta: Link;
  /** A button rather than a plain link. */
  button: boolean;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/* Same rule as isPast() in workations.ts: an unparseable end date counts as
   upcoming. */
function confirmedCount({ workations }: WorkationsResponse): number {
  return workations.filter((trip) => {
    const end = parseDate(trip.endDate);
    return end === null || ordinal(end) >= todayOrdinal();
  }).length;
}

function openPitchCount({ pitches }: PitchesResponse): number {
  return pitches.filter(
    (pitch) => pitch.status === "open" && pitch.deadline >= todayIso(),
  ).length;
}

function joinLive(
  workations: WorkationsResponse | null,
  pitches: PitchesResponse | null,
): string {
  const parts: string[] = [];
  if (workations) {
    parts.push(
      plural(confirmedCount(workations), "confirmed trip", "confirmed trips"),
    );
  }
  if (pitches) {
    const open = openPitchCount(pitches);
    parts.push(`${plural(open, "pitch", "pitches")} looking for interest`);
  }
  return parts.length === 0 ? "" : `${parts.join(" · ")}.`;
}

/** The top places, then the top months, one line each. */
function votePicks(polls: PollsResponse | null): string[] {
  if (!polls) {
    return [];
  }
  const find = (id: string) => polls.polls.find((poll) => poll.pollId === id);
  return [topPicks(find("location")), topPicks(find("month"))]
    .map((values) => values.join(", "))
    .filter((line) => line !== "");
}

function voteLive(polls: PollsResponse | null): string {
  if (!polls) {
    return "";
  }
  const voters = voterCount(polls);
  return voters === 0
    ? "Nobody has voted yet. Be the first."
    : `${plural(voters, "person has", "people have")} voted so far.`;
}

function buildCard(card: Card): HTMLElement {
  const root = template("involved-template");
  root.classList.add(`involved-card-${card.variant}`);
  requireEl(root, ".involved-label").textContent = card.label;
  requireEl(root, ".involved-title").textContent = card.title;
  requireEl(root, ".involved-body").textContent = card.body;

  const picks = requireEl(root, ".involved-picks");
  for (const line of card.picks ?? []) {
    const value = document.createElement("p");
    value.className = "involved-picks-value";
    value.textContent = line;
    picks.appendChild(value);
  }
  picks.hidden = (card.picks ?? []).length === 0;

  const live = requireEl(root, ".involved-live");
  live.textContent = card.live;
  live.hidden = card.live === "";

  const cta = requireEl(root, ".involved-cta");
  cta.textContent = card.cta.label;
  cta.setAttribute("href", appPath(card.cta.path));
  cta.className = card.button ? "auth-button involved-cta" : "involved-cta";
  if (!card.button) {
    /* Decoration, like the arrow on the /me rows: kept out of the name. */
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = " →";
    cta.appendChild(arrow);
  }
  return root;
}

function settled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

export async function mountInvolved(section: HTMLElement): Promise<void> {
  /* Only mounted once signed in, but a session can lapse in between. */
  if (!isSignedIn()) {
    return;
  }
  const results = await Promise.allSettled([
    api.getPitches(),
    api.getWorkations(),
    api.getPolls(),
  ]);
  /* Not one request got past n8n's JWT check (or n8n is down): keep the
     section hidden rather than show three cards of static copy. */
  if (results.every((result) => result.status === "rejected")) {
    return;
  }
  const pitches = settled(results[0]);
  const workations = settled(results[1]);
  const polls = settled(results[2]);

  const cards: Card[] = [
    {
      variant: "accent",
      label: "Pitch",
      title: "Organize your own trip",
      body: "Pick a place and dates. If enough colleagues are in by your deadline, it becomes an n8ncation, with you as the organizer.",
      live: "",
      cta: { label: "Pitch an n8ncation", path: "/pitch" },
      button: true,
    },
    {
      variant: "plain",
      label: "Join",
      title: "Join a trip",
      body: "RSVP to a confirmed n8ncation, or back a pitch so it can go ahead.",
      live: joinLive(workations, pitches),
      cta: { label: "See trips and pitches", path: "/workations" },
      button: false,
    },
    {
      variant: "vote",
      label: "Vote",
      title: "Help plan the next one",
      body: "Two quick questions: where and when. Anyone pitching a trip sees the top answers.",
      picks: votePicks(polls),
      live: voteLive(polls),
      cta: { label: "Add your vote", path: "/vote" },
      button: true,
    },
  ];

  requireEl(section, "[data-involved-cards]").replaceChildren(
    ...cards.map(buildCard),
  );
  section.hidden = false;
}
