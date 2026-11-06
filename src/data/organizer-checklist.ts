/* The organizer's checklist on a pitch's page (/pitches/<pitchId>), titled
   "Choose your own adventure": choices to make about the trip, grouped by
   category, not tasks that must all be done. Read-only guidance: nothing is
   ticked off or stored.

   Shown by renderChecklist() in src/features/pitches.ts, one collapsible
   category per group, only to the pitch's organizer and only while the
   pitch is open. This is generic advice, not private data, so it can ship in
   the bundle like the poll questions in polls.ts.

   Copy follows the Tone of Voice in n8ndesign.md: sentence case, no hype.
   Hints that mention logistics describe what the app does: once a trip is
   confirmed, attendees fill in their logistics (dietary needs, arrival and
   departure, emergency contact) and the organizer sees them on the trip
   page. */

export interface ChecklistItem {
  text: string;
  /** An optional second line with more detail. */
  hint?: string;
}

export interface ChecklistGroup {
  title: string;
  items: ChecklistItem[];
}

export const ORGANIZER_CHECKLIST: ChecklistGroup[] = [
  {
    title: "Accommodation",
    items: [
      {
        text: "Hotel or self-catered rental (like an Airbnb)?",
        hint: "A hotel handles cleaning and breakfast. A rental usually costs less and gives you a shared kitchen and living room.",
      },
      {
        text: "Is the wifi strong enough for a group on video calls?",
      },
      {
        text: "Are there enough power outlets for everyone’s laptop and phone?",
      },
      { text: "Is there a quiet space for private calls and meetings?" },
      { text: "Does everyone get a proper desk or table to work at?" },
      {
        text: "Shared bedrooms, or one each?",
        hint: "This changes the cost per person a lot.",
      },
    ],
  },
  {
    title: "Getting there",
    items: [
      {
        text: "How does everyone get there?",
        hint: "Note the nearest airport or train station in your pitch description.",
      },
      {
        text: "Rent a car, or rely on public transport and taxis once you’re there?",
      },
      {
        text: "Do you want to arrange a pickup?",
      },
      { text: "Does anyone need a visa or other travel documents?" },
    ],
  },
  {
    title: "Work days",
    items: [
      {
        text: "Fixed working hours, or does everyone keep their own schedule?",
        hint: "Think about time zones, and about the teams people need to reach.",
      },
      {
        text: "Do you want any shared sessions, like a workshop or a demo afternoon?",
      },
      { text: "Will there be quiet hours for focused work?" },
    ],
  },
  {
    title: "Food",
    items: [
      {
        text: "How do you want to share food?",
        hint: "Cook together, take turns, eat out, or a mix.",
      },
      { text: "Who does the grocery shopping, and when?" },
      {
        text: "What dietary needs do you need to plan for?",
        hint: "Attendees add them to their logistics once the trip is confirmed.",
      },
    ],
  },
  {
    title: "Money",
    items: [
      {
        text: "A group budget, or everyone pays for their own?",
        hint: "A shared pot makes groceries and taxis easy. Paying separately is easier to track.",
      },
      {
        text: "Who pays the deposit upfront, and how do people pay them back?",
      },
      {
        text: "What’s the cancellation policy?",
        hint: "Someone on the waitlist might take a spot that opens up.",
      },
    ],
  },
  {
    title: "After work",
    items: [
      {
        text: "What would you like to do together after work?",
      },
      { text: "Plan activities, or leave the evenings open?" },
      { text: "Does anything need booking in advance?" },
    ],
  },
  {
    title: "Health and safety",
    items: [
      {
        text: "Where’s the nearest pharmacy and hospital?",
        hint: "Attendees add an emergency contact to their logistics.",
      },
      { text: "Does everyone have travel insurance?" },
    ],
  },
];
