/* In-memory stand-in for the n8n API, used whenever VITE_API_BASE is unset.
   It mirrors the real contract closely enough to develop against: one vote row
   per person per poll, seeded with a few colleagues so the percentages are not
   all zero. State resets on reload — that is the point, it is not storage. */

import { ApiError } from "./types";
import type {
  Me,
  PollResult,
  PollsResponse,
  ProfileUpdate,
  Workation,
  WorkationsResponse,
} from "./types";
import { POLLS } from "../data/polls";
import { getUser } from "../auth";
import type { SessionUser } from "../auth";

interface VoteRow {
  sub: string;
  options: string[];
}

const LATENCY_MS = 260;

const voteRows: Record<string, VoteRow[]> = {
  month: [
    { sub: "seed-1", options: ["May", "June", "September"] },
    { sub: "seed-2", options: ["June", "September", "October"] },
    { sub: "seed-3", options: ["September"] },
    { sub: "seed-4", options: ["April", "May", "June"] },
  ],
  location: [
    { sub: "seed-1", options: ["Portugal"] },
    { sub: "seed-2", options: ["Ireland"] },
    { sub: "seed-3", options: ["Portugal"] },
  ],
};

const suggestedOptions: Record<string, string[]> = {
  location: ["Miami"],
};

/* Stands in for the `profiles` Data Table: one entry per user_sub. Starts
   empty, so the first open of the profile shows the same blank fields a
   colleague who has never filled it in would see. */
const profiles = new Map<string, ProfileUpdate>();

/* Stands in for the `workations` Data Table. Two rows — one upcoming, one
   past — so both sections of the main page have something to render and the
   date range formatting gets exercised across a month boundary. */
const workationRows: Omit<Workation, "attendees">[] = [
  {
    workationId: "01",
    slug: "roche-2026",
    title: "n8ncation #01",
    place: "Roche, Spain",
    startDate: "2026-11-06",
    endDate: "2026-11-13",
    description:
      "Our first n8ncation. A week together in a villa on the Andalusian coast, with space to work and the beach nearby.",
    imageUrl: "/villa.jpeg",
    imageAlt: "The pool and sunny terrace at Villa Alemania in Roche, Spain",
    organizer: { name: "Demo Organizer" },
  },
  {
    workationId: "00",
    slug: "lisbon-2025",
    title: "n8ncation #00",
    place: "Lisbon, Portugal",
    startDate: "2025-09-29",
    endDate: "2025-10-04",
    description:
      "A long weekend that started the whole idea. Six people, one apartment, and the first version of this site.",
    imageUrl: "/villa.jpeg",
    imageAlt: "Placeholder photo standing in for the Lisbon trip",
    /* No organizer, so the trip page's hidden-line path gets exercised. */
    organizer: null,
  },
];

/* Stands in for the `signups` join table: workationId -> the subs attending.
   Seeded so the counts are not all zero. */
const signupRows: Record<string, string[]> = {
  "01": ["seed-1", "seed-2", "seed-3", "seed-4", "seed-5"],
  "00": ["seed-1", "seed-2"],
};

function signupsFor(workationId: string): string[] {
  const existing = signupRows[workationId];
  if (existing) {
    return existing;
  }
  const created: string[] = [];
  signupRows[workationId] = created;
  return created;
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

function requireUser(): SessionUser {
  const user = getUser();
  if (!user) {
    throw new ApiError(401, "You need to sign in first.");
  }
  return user;
}

function rowsFor(pollId: string): VoteRow[] {
  const existing = voteRows[pollId];
  if (existing) {
    return existing;
  }
  const created: VoteRow[] = [];
  voteRows[pollId] = created;
  return created;
}

export function getPolls(): Promise<PollsResponse> {
  const polls: PollResult[] = POLLS.map((config) => {
    const rows = rowsFor(config.id);
    const suggested = suggestedOptions[config.id] ?? [];
    const values = [...config.seedOptions, ...suggested];

    return {
      pollId: config.id,
      voters: rows.length,
      options: values.map((value) => ({
        value,
        count: rows.filter((row) => row.options.includes(value)).length,
        suggested: suggested.includes(value),
      })),
    };
  });
  return delay({ polls });
}

export function getWorkations(): Promise<WorkationsResponse> {
  return delay({
    workations: workationRows.map((row) => ({
      ...row,
      attendees: signupsFor(row.workationId).length,
    })),
  });
}

export function rsvp(workationId: string, attending: boolean): Promise<void> {
  const user = requireUser();
  const subs = signupsFor(workationId);
  const index = subs.indexOf(user.sub);
  if (attending && index < 0) {
    subs.push(user.sub);
  } else if (!attending && index >= 0) {
    subs.splice(index, 1);
  }
  return delay(undefined);
}

export function getMe(): Promise<Me> {
  const user = requireUser();
  const votes: Record<string, string[]> = {};
  for (const config of POLLS) {
    const mine = rowsFor(config.id).find((row) => row.sub === user.sub);
    if (mine) {
      votes[config.id] = [...mine.options];
    }
  }
  const profile = profiles.get(user.sub);
  return delay({
    sub: user.sub,
    name: user.name,
    email: user.email,
    /* The demo session carries no avatar, so this is usually "" — which is
       the case the profile has to render anyway, for anyone whose Google
       account has no photo. */
    picture: user.picture,
    team: profile?.team ?? null,
    jobTitle: profile?.jobTitle ?? null,
    votes,
    signups: workationRows
      .filter((row) => signupsFor(row.workationId).includes(user.sub))
      .map((row) => row.workationId),
  });
}

export function updateProfile(update: ProfileUpdate): Promise<void> {
  const user = requireUser();
  profiles.set(user.sub, { team: update.team, jobTitle: update.jobTitle });
  return delay(undefined);
}

export function castVote(pollId: string, options: string[]): Promise<void> {
  const user = requireUser();
  const rows = rowsFor(pollId);
  const existing = rows.findIndex((row) => row.sub === user.sub);
  if (options.length === 0) {
    if (existing >= 0) {
      rows.splice(existing, 1);
    }
  } else if (existing >= 0) {
    rows[existing] = { sub: user.sub, options: [...options] };
  } else {
    rows.push({ sub: user.sub, options: [...options] });
  }
  return delay(undefined);
}

export function addPollOption(pollId: string, value: string): Promise<void> {
  requireUser();
  const existing = suggestedOptions[pollId] ?? [];
  const alreadyThere = [
    ...existing,
    ...(POLLS.find((poll) => poll.id === pollId)?.seedOptions ?? []),
  ].some((option) => option.toLowerCase() === value.toLowerCase());
  if (!alreadyThere) {
    suggestedOptions[pollId] = [...existing, value];
  }
  return delay(undefined);
}
