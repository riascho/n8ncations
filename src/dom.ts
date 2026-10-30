/* Shared lookups for the <template> elements in the page shells. Both the
   poll cards and the n8ncation cards are cloned from templates, so these live
   here rather than being copied into each feature. */

/** A card for the "Coming up" list on /workations. Trips and pitches come
    from two feature modules that cannot import each other, so each hands
    back cards in this shape and main.ts merges and orders them. */
export interface ListedCard {
  card: HTMLElement;
  /** YYYY-MM-DD; the list runs soonest first. */
  startDate: string;
  /** Sorted after every other card, whatever its date (cancelled pitches). */
  last: boolean;
}

/** Clones a <template>'s first element child, or throws if it is missing. */
export function template(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLTemplateElement)) {
    throw new Error(`Missing <template id="${id}">`);
  }
  const first = node.content.firstElementChild;
  if (!first) {
    throw new Error(`<template id="${id}"> is empty`);
  }
  return first.cloneNode(true) as HTMLElement;
}

/** Narrows a querySelector result, throwing rather than returning null — a
    missing hook is a build mistake, not a runtime condition to handle. */
export function requireEl(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`Expected ${selector} to exist`);
  }
  return found;
}
