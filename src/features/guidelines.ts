/* /guidelines: the People Ops rules for n8ncations, linked from the pitch
   form, where pitching means accepting them. The text comes from
   GET /guidelines, never from this repo: it is internal policy, and
   index.html ships to every visitor. That request is also this view's
   session check, so the body stays hidden until it succeeds. */

import * as api from "../api/client";
import { ApiError } from "../api/types";
import type {
  GuidelineBlock,
  GuidelineItem,
  GuidelineSection,
} from "../api/types";
import { requireEl } from "../dom";

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

/* "UK: Allowed…", with the lead in bold, then any nested list. */
function renderItem(item: GuidelineItem): HTMLLIElement {
  const li = element("li");
  if (item.lead) {
    li.append(element("strong", item.lead));
  }
  if (item.text) {
    li.append(item.lead ? ` ${item.text}` : item.text);
  }
  if (item.items.length > 0) {
    const nested = element("ul");
    nested.append(...item.items.map((text) => element("li", text)));
    li.append(nested);
  }
  return li;
}

function renderBlock(block: GuidelineBlock): HTMLElement {
  if (block.type === "paragraph") {
    return element("p", block.text);
  }
  const list = element(block.ordered ? "ol" : "ul");
  list.append(...block.items.map(renderItem));
  return list;
}

function renderSection(section: GuidelineSection): HTMLElement {
  const node = element("section");
  node.className = "guidelines-section";
  node.append(
    element("h2", section.heading),
    ...section.blocks.map(renderBlock),
  );
  return node;
}

export async function mountGuidelines(root: HTMLElement): Promise<void> {
  const state = requireEl(root, "[data-guidelines-state]");
  const body = requireEl(root, "[data-guidelines-body]");
  try {
    const guidelines = await api.getGuidelines();
    requireEl(root, "[data-guidelines-title]").textContent = guidelines.title;
    requireEl(root, "[data-guidelines-intro]").textContent = guidelines.intro;
    requireEl(root, "[data-guidelines-sections]").replaceChildren(
      ...guidelines.sections.map(renderSection),
    );
    const closing = requireEl(root, "[data-guidelines-closing]");
    closing.textContent = guidelines.closing;
    closing.hidden = guidelines.closing === "";
  } catch (error) {
    state.textContent =
      error instanceof ApiError
        ? error.message
        : "The guidelines could not be loaded.";
    return;
  }
  state.hidden = true;
  body.hidden = false;
}
