/* The poll answers with the most votes, for the "most votes so far" hints on
   the home page and the pitch form. Shared here because feature modules do
   not import each other. */

import type { PollResult, PollsResponse } from "./api/types";

/** Up to `n` option values with the most votes, leaving out any with none.
    Ties keep the order the API sent them in. */
export function topPicks(result: PollResult | undefined, n = 2): string[] {
  if (!result) {
    return [];
  }
  return result.options
    .filter((option) => option.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((option) => option.value);
}

/** "Portugal, Ireland in May, June", "Portugal" or "" when nobody has
    voted. Reads the location and month polls from src/data/polls.ts. */
export function picksSummary({ polls }: PollsResponse): string {
  const places = topPicks(polls.find((poll) => poll.pollId === "location"));
  const months = topPicks(polls.find((poll) => poll.pollId === "month"));
  return [places.join(", "), months.join(", ")]
    .filter((part) => part !== "")
    .join(" in ");
}

/** The most people who have voted in any one poll. */
export function voterCount({ polls }: PollsResponse): number {
  return Math.max(0, ...polls.map((poll) => poll.voters));
}
