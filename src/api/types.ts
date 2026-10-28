/* Shapes returned by the n8n webhook API. Kept in one place so the mock and
   the real client cannot drift apart. */

export interface PollOptionResult {
  value: string;
  /** How many people picked this option. */
  count: number;
  /** True when somebody added it via the free-text field. */
  suggested: boolean;
}

export interface PollResult {
  pollId: string;
  options: PollOptionResult[];
  /** Distinct people who have voted in this poll. */
  voters: number;
}

export interface PollsResponse {
  polls: PollResult[];
}

export interface Workation {
  /** Stable join key, zero-padded edition number: "01". */
  workationId: string;
  /** Drives the URL: /n8ncation/<slug>. */
  slug: string;
  title: string;
  place: string;
  /** YYYY-MM-DD, exactly as stored in the String column. */
  startDate: string;
  endDate: string;
  description: string;
  /** Absolute URL, or a root-relative path for anything in public/. For a
      trip that started as a pitch, the pitch's photo link, copied over. */
  imageUrl: string;
  imageAlt: string;
  /** The following three are copied from the pitch the trip started as, by
      the "Pitch decisions" workflow, or entered by hand. */
  /** http(s) link to the place people stay, or "" when none. */
  accommodationUrl: string;
  /** Estimated cost per person in euros, or null when not given. */
  costEstimate: number | null;
  /** What the estimate covers, or "" when not given. */
  costIncludes: string;
  /** How many people have a confirmed spot. Counts only, never who. */
  attendees: number;
  /** Spots on the trip, or null when there is no limit. */
  capacity: number | null;
  /** How many people are waiting for a spot to free up. */
  waitlisted: number;
  /** Who runs the trip, or null when nobody is named. The workflow resolves
      the `organizer` sub against `profiles` and sends display fields only:
      every signed-in colleague gets the same list, so never the sub and never
      the email. */
  organizer: Organizer | null;
}

/** Display fields for a trip's organizer. Only `name` is read. */
export interface Organizer {
  name: string;
}

export interface WorkationsResponse {
  workations: Workation[];
}

export interface Me {
  sub: string;
  name: string;
  email: string;
  picture: string;
  team: string | null;
  jobTitle: string | null;
  /** pollId -> the option values this person selected. */
  votes: Record<string, string[]>;
  /** workationIds this person has RSVP'd to. Own state belongs on /me for the
      same reason votes do: GET /workations is the same for everyone and
      returns counts only, so it can never say who is going. */
  signups: string[];
  /** Trips this person is waiting for a spot on, with their place in line. */
  waitlist: WaitlistEntry[];
  /** workationIds whose `organizer` is this person. Unlocks the attendee
      list and everyone's logistics on those trip pages. */
  organizing: string[];
}

export interface WaitlistEntry {
  workationId: string;
  /** 1 is next in line. */
  position: number;
}

/* ----------------------------------------------------------------
   RSVP with capacity
   ---------------------------------------------------------------- */

export type SignupStatus = "going" | "waitlist";

/** Body of a 200 from POST /rsvp with `attending: true`. The server decides
    the status, because only it knows whether the last spot went in the
    meantime. */
export interface RsvpResult {
  status: SignupStatus;
  /** Place in line when `status` is "waitlist", otherwise null. */
  position: number | null;
}

/* ----------------------------------------------------------------
   Pitches
   ---------------------------------------------------------------- */

/** "cancelled" means the organizer withdrew it, with a reason. "confirmed"
    means it had enough interest and is a trip in GET /workations now;
    "expired" means its deadline passed without enough. */
export type PitchStatus = "open" | "cancelled" | "confirmed" | "expired";

/** A pitch in GET /pitches. Everyone gets the open pitches, and the
    cancelled ones whose deadline hasn't passed, so the people interested in
    one can read why. On top of that, the caller gets every pitch they
    organize, in any status, for "your pitches" on /me. /pitches shows only the
    first group (see `isListed` in src/features/pitches.ts). */
export interface Pitch {
  pitchId: string;
  status: PitchStatus;
  /** The organizer's reason when `status` is "cancelled", otherwise "". */
  cancelReason: string;
  place: string;
  /** YYYY-MM-DD, like a trip's dates. */
  startDate: string;
  endDate: string;
  description: string;
  /** http(s) link to the place people would stay, or "" when none. */
  accommodationUrl: string;
  /** https link to a photo hosted elsewhere, usually on the accommodation's
      site, or "" when none. Nothing is uploaded: only the link is stored. */
  imageUrl: string;
  /** Describes the photo for screen readers. Set whenever imageUrl is. */
  imageAlt: string;
  /** Spots on the trip, or null for no limit (and so no waitlist), like a
      trip's capacity. */
  capacity: number | null;
  /** Interested people needed by `deadline` for the trip to go ahead. */
  threshold: number;
  /** YYYY-MM-DD. The last day interest counts. */
  deadline: string;
  /** Estimated cost per person in euros, or null when not given. */
  costEstimate: number | null;
  /** What the estimate covers, or "" when not given. */
  costIncludes: string;
  /** How many people have registered interest. */
  interested: number;
  /** Whether the caller has registered interest. Per caller, unlike
      GET /workations: it saves /pitches a GET /me for one boolean. */
  interestedByMe: boolean;
  /** Whether the caller pitched it, which unlocks editing and cancelling.
      A flag rather than the organizer's sub, which never leaves n8n. The
      workflows check ownership again on every write. */
  organizedByMe: boolean;
  /** Who pitched it. Display fields only, as for a trip's organizer. */
  organizer: Organizer | null;
}

export interface PitchesResponse {
  pitches: Pitch[];
}

/** Body of POST /pitch. The caller becomes the organizer, taken from the
    JWT, never from the body. Optional fields are sent as null. */
export interface NewPitch {
  place: string;
  startDate: string;
  endDate: string;
  description: string;
  accommodationUrl: string | null;
  /** null for no photo. On POST /pitch-update, null removes it. */
  imageUrl: string | null;
  imageAlt: string | null;
  /** null for no limit. */
  capacity: number | null;
  threshold: number;
  deadline: string;
  costEstimate: number | null;
  costIncludes: string | null;
}

export interface NewPitchResult {
  pitchId: string;
}

/** Body of POST /pitch-update: every field of the pitch, replaced as a
    whole. Only the organizer of an open pitch may send it; anyone else gets
    a 404. */
export interface PitchUpdate extends NewPitch {
  pitchId: string;
}

/** Body of POST /pitch-cancel. Same rule as PitchUpdate: organizer only,
    open pitches only. */
export interface PitchCancel {
  pitchId: string;
  reason: string;
}

/* ----------------------------------------------------------------
   Private logistics
   ---------------------------------------------------------------- */

/** One person's logistics for one trip. Every field is optional; an empty
    field is null. Seen only by that person and the trip's organizer. */
export interface Logistics {
  dietary: string | null;
  roomPreference: string | null;
  /** Local date and time as YYYY-MM-DDTHH:MM, the value of a datetime-local
      input. No timezone: it is the time at the destination. */
  arrival: string | null;
  departure: string | null;
  emergencyContact: string | null;
}

export interface LogisticsResponse {
  /** The caller's own logistics for the trip, or null if never saved. */
  mine: Logistics | null;
}

/** One person on an organizer's attendee list. */
export interface RosterEntry {
  name: string;
  email: string;
  team: string | null;
  status: SignupStatus;
  /** Place in line when waitlisted, otherwise null. */
  position: number | null;
  logistics: Logistics | null;
}

export interface RosterResponse {
  people: RosterEntry[];
}

/** The fields somebody may edit on their own profile. Everything else on
    `Me` comes from Google and is not ours to change. An empty field is sent
    as null, so "cleared" and "never set" are one state in storage. */
export interface ProfileUpdate {
  team: string | null;
  jobTitle: string | null;
}

/** Thrown for any non-2xx response. `status` 401/403 means re-authenticate. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }
}
