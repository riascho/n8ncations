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
  /** YYYY-MM-DD. A trailing time component is tolerated and dropped when the
      date is parsed for display. */
  startDate: string;
  endDate: string;
  description: string;
  /** Absolute URL, or a root-relative path for anything in public/. */
  imageUrl: string;
  imageAlt: string;
  /** How many people have signed up. Counts only, never who. */
  attendees: number;
  /** Who runs the trip, or null when nobody is named. The workflow resolves
      the `organizer` sub against `profiles` and sends display fields only:
      this endpoint is public, so never the sub and never the email. */
  organizer: Organizer | null;
}

/** Public display fields for a trip's organizer. Only `name` is read. */
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
      same reason votes do: GET /workations is public and returns counts only,
      so it can never say who is going. */
  signups: string[];
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
