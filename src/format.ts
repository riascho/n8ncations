/* Formatting and link checks that more than one feature needs: the pitch
   cards and the trip page both show a cost and an accommodation link, and
   feature modules cannot import each other. */

/** Every amount is in euros for now; see README → Support other
    currencies. */
export const euros = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/* Only http(s) links become hrefs. Pitches are typed by colleagues, and a
   javascript: URL in an href would run on click. */
export function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/* Multi-line text keeps its line breaks, unlike the one-line fields. Used
   for a pitch's description, a cancellation reason and what's important to
   someone for a trip. The workflows apply the same rules. */
export function tidyParagraph(value: string, max: number): string {
  return value
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/* Stricter, for photo links: the site is served over https, so an http
   image would be blocked as mixed content. This also rules out data: and
   javascript: URLs. */
export function httpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
