/* Shared lookups for the <template> elements in the page shells. Both the
   poll cards and the n8ncation cards are cloned from templates, so these live
   here rather than being copied into each feature. */

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
