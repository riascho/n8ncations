/* The only place that talks to n8n. Every route, reads included, carries the
   session JWT, which n8n verifies itself via the webhook's JWT Auth option.

   With VITE_API_BASE unset the whole module falls through to the in-memory
   mock, so the UI can be built and reviewed without a live n8n instance. */

import { ApiError } from "./types";
import type {
  Me,
  PollsResponse,
  ProfileUpdate,
  WorkationsResponse,
} from "./types";
import { getToken } from "../auth";
import * as mock from "./mock";

const BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

export const usingMock = BASE === "";

async function request<T>(
  path: string,
  init: RequestInit = {},
  authenticated = false,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (authenticated) {
    const token = getToken();
    if (!token) {
      throw new ApiError(401, "You need to sign in first.");
    }
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    /* Network-level failure: offline, DNS, or a CORS rejection. */
    throw new ApiError(0, "Could not reach the server.");
  }

  if (!response.ok) {
    throw new ApiError(response.status, await describeFailure(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }

  /* Read the body as text instead of calling response.json() directly. The
     write endpoints are request<void> and want no body at all, so an empty
     200 from a workflow whose Respond node returns no data must not fail.
     Text also keeps the raw payload for the message below, where json()
     would give us nothing but an opaque SyntaxError. */
  let raw: string;
  try {
    raw = await response.text();
  } catch {
    /* Headers arrived, then the body stream aborted mid-transfer. */
    throw new ApiError(0, "Could not reach the server.");
  }

  if (raw.trim() === "") {
    return undefined as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiError(
      response.status,
      `The server sent a reply we could not read: ${raw.slice(0, 200)}`,
    );
  }
}

async function describeFailure(response: Response): Promise<string> {
  if (response.status === 401 || response.status === 403) {
    return "Your session has expired. Please sign in again.";
  }
  /* n8n surfaces workflow errors as a JSON body when it can. */
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string" && body.message) {
      return body.message;
    }
  } catch {
    /* Fall through to the generic message. */
  }
  return `Request failed (${response.status}).`;
}

export function getPolls(): Promise<PollsResponse> {
  return usingMock
    ? mock.getPolls()
    : request<PollsResponse>("/polls", {}, true);
}

export function getWorkations(): Promise<WorkationsResponse> {
  return usingMock
    ? mock.getWorkations()
    : request<WorkationsResponse>("/workations", {}, true);
}

export function getMe(): Promise<Me> {
  return usingMock ? mock.getMe() : request<Me>("/me", {}, true);
}

/* `attending` carries both directions rather than having a separate cancel
   path, so the button is one call either way. The workflow upserts on true
   and deletes the row on false. */
export function rsvp(workationId: string, attending: boolean): Promise<void> {
  if (usingMock) {
    return mock.rsvp(workationId, attending);
  }
  return request<void>(
    "/rsvp",
    { method: "POST", body: JSON.stringify({ workationId, attending }) },
    true,
  );
}

/* Shares the /me path with the read above: n8n allows one webhook per path
   and method, so the workflow has Settings → Allow Multiple HTTP Methods and
   branches on the method. */
export function updateProfile(update: ProfileUpdate): Promise<void> {
  if (usingMock) {
    return mock.updateProfile(update);
  }
  return request<void>(
    "/me",
    { method: "POST", body: JSON.stringify(update) },
    true,
  );
}

export function castVote(pollId: string, options: string[]): Promise<void> {
  if (usingMock) {
    return mock.castVote(pollId, options);
  }
  return request<void>(
    "/vote",
    { method: "POST", body: JSON.stringify({ pollId, options }) },
    true,
  );
}

export function addPollOption(pollId: string, value: string): Promise<void> {
  if (usingMock) {
    return mock.addPollOption(pollId, value);
  }
  return request<void>(
    "/poll-option",
    { method: "POST", body: JSON.stringify({ pollId, value }) },
    true,
  );
}
