export interface PagePassage {
  el: Element;
  text: string;
}

const BLOCKS = "p, li, h2, h3, h4, blockquote, dd, figcaption, td";
// Footnote and reference lists answer questions about citations, not about the
// page, so they are left out along with page chrome.
const SKIP_ANCESTORS =
  "nav, header, footer, aside, script, style, noscript, form, [aria-hidden='true'], " +
  ".references, .reflist, [role='doc-endnotes'], [role='doc-bibliography']";
const MIN_LENGTH = 40;
const MAX_LENGTH = 600;
const MAX_PASSAGES = 2000;

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

// The readable blocks of the current page, in document order. Nested blocks
// (a <p> inside an <li>) are kept once, at the innermost level.
export function collectPassages(): PagePassage[] {
  const root = document.querySelector("main, article, [role='main']") ?? document.body;
  const passages: PagePassage[] = [];

  for (const el of root.querySelectorAll(BLOCKS)) {
    if (passages.length >= MAX_PASSAGES) break;
    if (el.closest(SKIP_ANCESTORS) || el.querySelector(BLOCKS)) continue;

    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length < MIN_LENGTH || !isVisible(el)) continue;

    passages.push({ el, text: text.slice(0, MAX_LENGTH) });
  }
  return passages;
}
