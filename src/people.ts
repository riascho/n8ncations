/* Who is going on, waitlisted for, or interested in a trip: the short
   sentence on cards ("Ada, Ben and 3 more people are going") and the full
   list on a trip's or a pitch's page. Shared by workations.ts and
   pitches.ts, which can't import each other.

   The lists come from GET /workations and GET /pitches, which send display
   fields only (name, team, job title) and flag the caller with `isMe`.
   Everything here is inserted with textContent: names, teams and job
   titles are all typed by people. */

import type { Me, Person } from "./api/types";
import { getUser } from "./auth";
import { requireEl } from "./dom";

/** What the people in a sentence did: "Ada is going", "Ada went", "Ada is
    interested". */
export type PeopleVerb = "going" | "went" | "interested";

/** How many people a sentence names before it counts the rest. */
const NAMED = 2;

function firstName(person: Person): string {
  return person.name.trim().split(/\s+/)[0] ?? "";
}

/** The caller first, so they find themselves at a glance. */
function meFirst(people: Person[]): Person[] {
  return [
    ...people.filter((person) => person.isMe),
    ...people.filter((person) => !person.isMe),
  ];
}

function predicate(subject: string, plural: boolean, verb: PeopleVerb): string {
  if (verb === "went") {
    return `${subject} went`;
  }
  if (subject === "You") {
    return `You’re ${verb}`;
  }
  return `${subject} ${plural ? "are" : "is"} ${verb}`;
}

/** "Ada is going", "You and Ada are interested", "Ada, Ben and 1 more
    person are going", "You, Ada and 3 more people went". First names only,
    so a card stays short; the page's list has full names. Someone without
    a name is counted in "more". Null for nobody, so each caller can say
    "No one…" its own way. */
export function namesSentence(
  people: Person[],
  verb: PeopleVerb,
): string | null {
  if (people.length === 0) {
    return null;
  }
  const named: string[] = [];
  for (const person of meFirst(people)) {
    if (named.length === NAMED) {
      break;
    }
    const label = person.isMe ? "You" : firstName(person);
    if (label) {
      named.push(label);
    }
  }
  const rest = people.length - named.length;

  if (rest === 0) {
    const [only, second] = named;
    return second
      ? predicate(`${only} and ${second}`, true, verb)
      : predicate(only ?? "", false, verb);
  }
  const more = rest === 1 ? "1 more person" : `${rest} more people`;
  if (named.length === 0) {
    return predicate(
      rest === 1 ? "1 person" : `${rest} people`,
      rest !== 1,
      verb,
    );
  }
  return predicate(`${named.join(", ")} and ${more}`, true, verb);
}

/** The reader's own entry, for the optimistic update when they RSVP or
    register interest. The page's GET /me supplies the team and job title
    where it has one (trip pages and /workations); a pitch's page loads no
    /me, so there the two stay empty until the next reload. */
export function selfPerson(me: Me | null): Person {
  return {
    name: me?.name ?? getUser()?.name ?? "",
    team: me?.team ?? null,
    jobTitle: me?.jobTitle ?? null,
    isMe: true,
  };
}

/** A copy of `people` without the reader. */
export function withoutMe(people: Person[]): Person[] {
  return people.filter((person) => !person.isMe);
}

function buildItem(person: Person): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "people-item";

  const name = document.createElement("span");
  name.className = "people-name";
  const full = person.name.trim() || "A colleague";
  name.textContent = person.isMe ? `${full} (you)` : full;
  item.appendChild(name);

  /* "Job title · Team", leaving out whichever the person hasn't set. */
  const role = [person.jobTitle, person.team]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(" · ");
  if (role) {
    const line = document.createElement("span");
    line.className = "people-role";
    line.textContent = role;
    item.appendChild(line);
  }
  return item;
}

function fillList(list: HTMLElement, people: Person[]): void {
  list.replaceChildren(...people.map(buildItem));
}

export interface PeopleSection {
  /** "Who’s going", "Who went" or "Who’s interested". */
  title: string;
  people: Person[];
  /** Shown when `people` is empty. */
  emptyText: string;
  /** A trip's waitlist, in order. Left out on a pitch's page. */
  waitlist?: Person[];
}

/** Fills the page's "Who's going" section (`[data-people]` in index.html)
    and shows it. Called again after every RSVP or interest change. */
export function renderPeopleSection(
  root: ParentNode,
  section: PeopleSection,
): void {
  const box = requireEl(root, "[data-people]");
  requireEl(box, "[data-people-title]").textContent = section.title;

  const empty = requireEl(box, "[data-people-empty]");
  empty.textContent = section.emptyText;
  empty.hidden = section.people.length > 0;
  const going = requireEl(box, "[data-people-going]");
  fillList(going, section.people);
  going.hidden = section.people.length === 0;

  const waitlist = section.waitlist ?? [];
  const waiting = requireEl(box, "[data-people-waitlist]");
  fillList(requireEl(waiting, "ol"), waitlist);
  waiting.hidden = waitlist.length === 0;

  box.hidden = false;
}

/** Hides the section, for a cancelled pitch. */
export function hidePeopleSection(root: ParentNode): void {
  requireEl(root, "[data-people]").hidden = true;
}
