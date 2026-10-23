export type PollMode = "single" | "multi";

export interface PollConfig {
  id: string;
  question: string;
  mode: PollMode;
  hint: string;
  seedOptions: string[];
  allowSuggestions: boolean;
  split: boolean;
  suggestPlaceholder?: string;
  suggestLabel?: string;
}

export const MAX_SUGGESTION_LENGTH = 40;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const POLLS: PollConfig[] = [
  {
    id: "month",
    question: "Which months could you make it?",
    mode: "multi",
    hint: "Pick every month that works for you.",
    seedOptions: MONTHS,
    allowSuggestions: false,
    split: true,
  },
  {
    id: "location",
    question: "Where should the next n8ncation be?",
    mode: "multi",
    hint: "Pick every place you’d be happy with.",
    seedOptions: ["Ireland", "Portugal", "Finland"],
    allowSuggestions: true,
    split: false,
    suggestLabel: "Somewhere else? Add it and everyone can vote on it.",
    suggestPlaceholder: "e.g. Miami",
  },
];
