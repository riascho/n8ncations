/* In-memory stand-in for the n8n API, used whenever VITE_API_BASE is unset.
   It mirrors the real contract closely enough to develop against: one vote row
   per person per poll, seeded with a few colleagues so the percentages are not
   all zero. State resets on reload — that is the point, it is not storage. */

import { ApiError } from "./types";
import type {
  Logistics,
  LogisticsResponse,
  Me,
  NewPitch,
  NewPitchResult,
  Pitch,
  PitchesResponse,
  PitchUpdate,
  PollResult,
  PollsResponse,
  ProfileUpdate,
  RosterEntry,
  RosterResponse,
  RsvpResult,
  SignupStatus,
  WaitlistEntry,
  Workation,
  WorkationsResponse,
} from "./types";
import { POLLS } from "../data/polls";
import { getUser } from "../auth";
import { todayIso } from "../dates";
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

/* The seeded colleagues' Google fields, which the real `profiles` table gets
   from sign-in. Used to resolve organizers and fill the attendee list. */
interface Person {
  name: string;
  email: string;
  team: string | null;
}

const people: Record<string, Person> = {
  "seed-1": { name: "Ada Example", email: "ada@n8n.io", team: "Engineering" },
  "seed-2": { name: "Ben Example", email: "ben@n8n.io", team: "Design" },
  "seed-3": { name: "Cleo Example", email: "cleo@n8n.io", team: "Support" },
  "seed-4": { name: "Dev Example", email: "dev@n8n.io", team: null },
  "seed-5": { name: "Eli Example", email: "eli@n8n.io", team: "Sales" },
  "seed-6": { name: "Fay Example", email: "fay@n8n.io", team: "Marketing" },
  "seed-organizer": {
    name: "Demo Organizer",
    email: "organizer@n8n.io",
    team: "People",
  },
};

function personFor(sub: string): Person {
  const seeded = people[sub];
  if (seeded) {
    return seeded;
  }
  /* Anyone not seeded is the demo user, whose fields live in the session. */
  const user = getUser();
  return {
    name: user?.name ?? "",
    email: user?.email ?? "",
    team: profiles.get(sub)?.team ?? null,
  };
}

/* Stands in for the `workations` Data Table. Three rows — two upcoming, one
   past — so both sections of /workations have something to render and the
   date range formatting gets exercised across a month boundary.

   The capacities are set up to exercise both RSVP outcomes: Roche has one
   spot left, so the demo user gets it; Lapland is already full, so the demo
   user joins its waitlist. The demo user organizes Roche, which shows the
   attendee list on that trip's page. */
type WorkationRow = Omit<
  Workation,
  "attendees" | "waitlisted" | "organizer"
> & {
  organizerSub: string | null;
};

const workationRows: WorkationRow[] = [
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
    capacity: 6,
    organizerSub: "demo-user",
  },
  {
    workationId: "02",
    slug: "lapland-2027",
    title: "n8ncation #02",
    place: "Lapland, Finland",
    startDate: "2027-02-15",
    endDate: "2027-02-22",
    description:
      "A winter week in a cabin near Rovaniemi. Short days, a shared sauna and, with luck, the northern lights.",
    imageUrl: "/villa.jpeg",
    imageAlt: "Placeholder photo standing in for the Lapland trip",
    capacity: 4,
    organizerSub: "seed-organizer",
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
    capacity: null,
    /* No organizer, so the trip page's hidden-line path gets exercised. */
    organizerSub: null,
  },
];

/* Stands in for the `signups` table: workationId -> rows in sign-up order,
   which is also the waitlist order. Seeded so the counts are not all zero. */
interface SignupRow {
  sub: string;
  status: SignupStatus;
}

const signupRows: Record<string, SignupRow[]> = {
  "01": ["seed-1", "seed-2", "seed-3", "seed-4", "seed-5"].map((sub) => ({
    sub,
    status: "going",
  })),
  "02": [
    { sub: "seed-1", status: "going" },
    { sub: "seed-2", status: "going" },
    { sub: "seed-3", status: "going" },
    { sub: "seed-4", status: "going" },
    { sub: "seed-6", status: "waitlist" },
  ],
  "00": [
    { sub: "seed-1", status: "going" },
    { sub: "seed-2", status: "going" },
  ],
};

function signupsFor(workationId: string): SignupRow[] {
  const existing = signupRows[workationId];
  if (existing) {
    return existing;
  }
  const created: SignupRow[] = [];
  signupRows[workationId] = created;
  return created;
}

function goingCount(workationId: string): number {
  return signupsFor(workationId).filter((row) => row.status === "going").length;
}

/** 1-based place in line, or null when `sub` is not waitlisted. */
function waitlistPosition(workationId: string, sub: string): number | null {
  const waiting = signupsFor(workationId).filter(
    (row) => row.status === "waitlist",
  );
  const index = waiting.findIndex((row) => row.sub === sub);
  return index < 0 ? null : index + 1;
}

/* Stands in for the `logistics` table, keyed "<workationId>:<sub>". */
const logisticsRows = new Map<string, Logistics>([
  [
    "01:seed-1",
    {
      dietary: "Vegetarian",
      roomPreference: "Happy to share",
      arrival: "2026-11-06T14:30",
      departure: "2026-11-13T10:00",
      emergencyContact: "Sam Example, +49 30 1234567",
    },
  ],
  [
    "01:seed-3",
    {
      dietary: null,
      roomPreference: "Single room if possible",
      arrival: "2026-11-06T18:05",
      departure: null,
      emergencyContact: null,
    },
  ],
]);

function logisticsKey(workationId: string, sub: string): string {
  return `${workationId}:${sub}`;
}

/* Stands in for the `pitches` and `pitch_interest` tables. The first is a
   few people short of its threshold, so registering interest moves the bar
   visibly. The demo user pitched the third, so its card shows the edit and
   cancel controls. The demo user's two closed pitches (one expired, one
   that became the Roche trip) only show under "your pitches" on /me. */
type PitchRow = Omit<
  Pitch,
  "interested" | "interestedByMe" | "organizedByMe" | "organizer"
> & {
  organizerSub: string;
};

const pitchRows: PitchRow[] = [
  {
    pitchId: "p-01",
    status: "open",
    cancelReason: "",
    place: "Porto, Portugal",
    startDate: "2027-05-10",
    endDate: "2027-05-17",
    description:
      "A townhouse by the river with a big table for working and a terrace for evenings. Direct flights from most European hubs.",
    accommodationUrl: "https://example.com/porto-townhouse",
    capacity: 10,
    threshold: 8,
    deadline: "2026-12-15",
    costEstimate: 650,
    costIncludes: "Accommodation, coworking space, two shared dinners",
    organizerSub: "seed-2",
  },
  {
    pitchId: "p-02",
    status: "open",
    cancelReason: "",
    place: "Galway, Ireland",
    startDate: "2027-06-07",
    endDate: "2027-06-11",
    description:
      "A shorter trip on the west coast. Mornings at work, afternoons on the coast or in town.",
    accommodationUrl: "",
    /* No limit, so the card's "No limit" path gets exercised. */
    capacity: null,
    threshold: 6,
    deadline: "2027-01-31",
    costEstimate: null,
    costIncludes: "",
    organizerSub: "seed-3",
  },
  {
    pitchId: "p-03",
    status: "open",
    cancelReason: "",
    place: "Lake Bled, Slovenia",
    startDate: "2027-04-12",
    endDate: "2027-04-16",
    description:
      "A guesthouse on the lake with fast wifi and a big shared kitchen. Ljubljana airport is 40 minutes away.",
    accommodationUrl: "https://example.com/bled-guesthouse",
    capacity: 8,
    threshold: 5,
    deadline: "2027-01-15",
    costEstimate: 520,
    costIncludes: "Accommodation and breakfast",
    organizerSub: "demo-user",
  },
  {
    pitchId: "p-04",
    status: "expired",
    cancelReason: "",
    place: "Tallinn, Estonia",
    startDate: "2026-10-12",
    endDate: "2026-10-16",
    description:
      "A week in the old town in early autumn, with a coworking space by the harbour.",
    accommodationUrl: "",
    capacity: 8,
    threshold: 6,
    deadline: "2026-09-15",
    costEstimate: 480,
    costIncludes: "",
    organizerSub: "demo-user",
  },
  {
    pitchId: "p-00",
    status: "confirmed",
    cancelReason: "",
    place: "Roche, Spain",
    startDate: "2026-11-06",
    endDate: "2026-11-13",
    description:
      "A week together in a villa on the Andalusian coast, with space to work and the beach nearby.",
    accommodationUrl: "",
    capacity: 6,
    threshold: 4,
    deadline: "2026-08-31",
    costEstimate: null,
    costIncludes: "",
    organizerSub: "demo-user",
  },
];

const interestRows: Record<string, string[]> = {
  "p-01": ["seed-2", "seed-1", "seed-4", "seed-5", "seed-6"],
  "p-02": ["seed-3", "seed-1"],
  "p-03": ["demo-user", "seed-5"],
  "p-04": ["demo-user", "seed-1", "seed-6"],
  "p-00": ["demo-user", "seed-1", "seed-2", "seed-3", "seed-4"],
};

function interestFor(pitchId: string): string[] {
  const existing = interestRows[pitchId];
  if (existing) {
    return existing;
  }
  const created: string[] = [];
  interestRows[pitchId] = created;
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

function requireTrip(workationId: string): WorkationRow {
  const trip = workationRows.find((row) => row.workationId === workationId);
  if (!trip) {
    throw new ApiError(404, "We could not find that n8ncation.");
  }
  return trip;
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
  requireUser();
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
  requireUser();
  return delay({
    workations: workationRows.map(({ organizerSub, ...row }) => ({
      ...row,
      attendees: goingCount(row.workationId),
      waitlisted: signupsFor(row.workationId).filter(
        (signup) => signup.status === "waitlist",
      ).length,
      organizer: organizerSub ? { name: personFor(organizerSub).name } : null,
    })),
  });
}

/* Mirrors the workflow: a spot while there is room, the waitlist after that,
   and cancelling a spot hands it to whoever is first in line. */
export function rsvp(
  workationId: string,
  attending: boolean,
): Promise<RsvpResult | undefined> {
  const user = requireUser();
  const trip = requireTrip(workationId);
  const rows = signupsFor(workationId);
  const index = rows.findIndex((row) => row.sub === user.sub);

  if (attending) {
    if (index < 0) {
      const full =
        trip.capacity !== null && goingCount(workationId) >= trip.capacity;
      rows.push({ sub: user.sub, status: full ? "waitlist" : "going" });
    }
    const status = rows.find((row) => row.sub === user.sub)?.status ?? "going";
    return delay({
      status,
      position: waitlistPosition(workationId, user.sub),
    });
  }

  if (index >= 0) {
    const [removed] = rows.splice(index, 1);
    logisticsRows.delete(logisticsKey(workationId, user.sub));
    if (removed?.status === "going") {
      const next = rows.find((row) => row.status === "waitlist");
      if (next) {
        next.status = "going";
      }
    }
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
  const waitlist: WaitlistEntry[] = [];
  for (const row of workationRows) {
    const position = waitlistPosition(row.workationId, user.sub);
    if (position !== null) {
      waitlist.push({ workationId: row.workationId, position });
    }
  }
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
      .filter((row) =>
        signupsFor(row.workationId).some(
          (signup) => signup.sub === user.sub && signup.status === "going",
        ),
      )
      .map((row) => row.workationId),
    waitlist,
    organizing: workationRows
      .filter((row) => row.organizerSub === user.sub)
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

export function getPitches(): Promise<PitchesResponse> {
  const user = requireUser();
  const today = todayIso();
  /* Like the workflow: everyone gets open pitches and cancelled ones until
     their deadline, and the caller also gets every pitch they organize. */
  const listed = pitchRows.filter(
    (row) =>
      row.status === "open" ||
      (row.status === "cancelled" && row.deadline >= today) ||
      row.organizerSub === user.sub,
  );
  return delay({
    pitches: listed.map(({ organizerSub, ...row }) => {
      const interested = interestFor(row.pitchId);
      return {
        ...row,
        interested: interested.length,
        interestedByMe: interested.includes(user.sub),
        organizedByMe: organizerSub === user.sub,
        organizer: { name: personFor(organizerSub).name },
      };
    }),
  });
}

/* The frontend validates before sending; this only rejects what the workflow
   would, so a broken form still shows up in mock mode. */
function rejectInvalid(pitch: NewPitch): void {
  if (
    !pitch.place ||
    !pitch.description ||
    (pitch.capacity !== null && pitch.threshold > pitch.capacity) ||
    pitch.startDate > pitch.endDate ||
    pitch.deadline >= pitch.startDate
  ) {
    throw new ApiError(
      400,
      "Some of the pitch details are missing or invalid.",
    );
  }
}

/* The workflows' ownership check: 404 for a pitch that is missing or someone
   else's, so the answer does not reveal which. 400 once it is closed. */
function requireOwnOpenPitch(pitchId: string, sub: string): PitchRow {
  const row = pitchRows.find((pitch) => pitch.pitchId === pitchId);
  if (!row || row.organizerSub !== sub) {
    throw new ApiError(404, "We could not find that pitch.");
  }
  if (row.status !== "open") {
    throw new ApiError(400, "This pitch is closed.");
  }
  return row;
}

export function createPitch(pitch: NewPitch): Promise<NewPitchResult> {
  const user = requireUser();
  rejectInvalid(pitch);
  const pitchId = `p-${String(pitchRows.length + 1).padStart(2, "0")}`;
  pitchRows.push({
    pitchId,
    status: "open",
    cancelReason: "",
    place: pitch.place,
    startDate: pitch.startDate,
    endDate: pitch.endDate,
    description: pitch.description,
    accommodationUrl: pitch.accommodationUrl ?? "",
    capacity: pitch.capacity,
    threshold: pitch.threshold,
    deadline: pitch.deadline,
    costEstimate: pitch.costEstimate,
    costIncludes: pitch.costIncludes ?? "",
    organizerSub: user.sub,
  });
  /* The workflow counts the organizer as the first interested person. */
  interestRows[pitchId] = [user.sub];
  return delay({ pitchId });
}

/* Interest is kept: the people already in stay counted after an edit. */
export function updatePitch(update: PitchUpdate): Promise<void> {
  const user = requireUser();
  const row = requireOwnOpenPitch(update.pitchId, user.sub);
  rejectInvalid(update);
  Object.assign(row, {
    place: update.place,
    startDate: update.startDate,
    endDate: update.endDate,
    description: update.description,
    accommodationUrl: update.accommodationUrl ?? "",
    capacity: update.capacity,
    threshold: update.threshold,
    deadline: update.deadline,
    costEstimate: update.costEstimate,
    costIncludes: update.costIncludes ?? "",
  });
  return delay(undefined);
}

export function cancelPitch(pitchId: string, reason: string): Promise<void> {
  const user = requireUser();
  const row = requireOwnOpenPitch(pitchId, user.sub);
  if (!reason.trim()) {
    throw new ApiError(400, "Say why you’re cancelling the pitch.");
  }
  row.status = "cancelled";
  row.cancelReason = reason.trim();
  return delay(undefined);
}

export function setPitchInterest(
  pitchId: string,
  interested: boolean,
): Promise<void> {
  const user = requireUser();
  const pitch = pitchRows.find((row) => row.pitchId === pitchId);
  if (!pitch) {
    throw new ApiError(404, "We could not find that pitch.");
  }
  if (pitch.status !== "open") {
    throw new ApiError(400, "This pitch is closed.");
  }
  const subs = interestFor(pitchId);
  const index = subs.indexOf(user.sub);
  if (interested && index < 0) {
    subs.push(user.sub);
  } else if (!interested && index >= 0) {
    subs.splice(index, 1);
  }
  return delay(undefined);
}

export function getLogistics(workationId: string): Promise<LogisticsResponse> {
  const user = requireUser();
  requireTrip(workationId);
  const mine = logisticsRows.get(logisticsKey(workationId, user.sub));
  return delay({ mine: mine ? { ...mine } : null });
}

export function saveLogistics(
  workationId: string,
  logistics: Logistics,
): Promise<void> {
  const user = requireUser();
  requireTrip(workationId);
  if (!signupsFor(workationId).some((row) => row.sub === user.sub)) {
    throw new ApiError(400, "Sign up for this n8ncation first.");
  }
  logisticsRows.set(logisticsKey(workationId, user.sub), { ...logistics });
  return delay(undefined);
}

export function getRoster(workationId: string): Promise<RosterResponse> {
  const user = requireUser();
  const trip = requireTrip(workationId);
  /* 404 rather than 403, as in the workflow: client.ts reads 403 as an
     expired session. */
  if (trip.organizerSub !== user.sub) {
    throw new ApiError(404, "We could not find that n8ncation.");
  }
  const roster: RosterEntry[] = signupsFor(workationId).map((row) => {
    const person = personFor(row.sub);
    const logistics = logisticsRows.get(logisticsKey(workationId, row.sub));
    return {
      name: person.name,
      email: person.email,
      team: person.team,
      status: row.status,
      position: waitlistPosition(workationId, row.sub),
      logistics: logistics ? { ...logistics } : null,
    };
  });
  return delay({ people: roster });
}
