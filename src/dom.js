import {
  alreadyInTargetLanguage,
  isTranslatableText,
  splitEdges,
  splitForApi,
} from "./shared.js";

const BLOCK_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "CODE",
  "PRE",
  "KBD",
  "SAMP",
  "CANVAS",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "MATH",
  "TEMPLATE",
  "NOFRAMES",
]);

const TEXT_ATTRS = ["placeholder", "title", "alt", "aria-label"];

function blocksDescendants(element) {
  if (BLOCK_TAGS.has(element.tagName)) return true;
  if (element.getAttribute("translate") === "no") return true;
  if (element.hasAttribute("data-mi-root")) return true;
  const editable = element.getAttribute("contenteditable");
  return editable === "" || editable === "true" || editable === "plaintext-only";
}

function attrSkipped(skipAttrs, element, attr) {
  return skipAttrs?.get(element)?.has(attr) ?? false;
}

function pushAttr(element, attr, raw, targetLang, segments, skipAttrs) {
  if (raw == null || attrSkipped(skipAttrs, element, attr)) return;
  const { lead, core, trail } = splitEdges(raw);
  if (!isTranslatableText(core) || alreadyInTargetLanguage(core, targetLang)) return;
  segments.push({
    kind: "attr",
    element,
    attr,
    lead,
    trail,
    parts: splitForApi(core),
  });
}

function collectAttrs(element, targetLang, segments, skipAttrs) {
  for (const attr of TEXT_ATTRS) {
    if (!element.hasAttribute(attr)) continue;
    pushAttr(element, attr, element.getAttribute(attr), targetLang, segments, skipAttrs);
  }
  if (element.tagName !== "INPUT") return;
  const type = (element.getAttribute("type") || "text").toLowerCase();
  if (type !== "button" && type !== "submit" && type !== "reset") return;
  if (!element.hasAttribute("value")) return;
  pushAttr(element, "value", element.getAttribute("value"), targetLang, segments, skipAttrs);
}

function pushText(node, targetLang, segments, skipText) {
  if (skipText?.has(node)) return;
  const { lead, core, trail } = splitEdges(node.nodeValue ?? "");
  if (!isTranslatableText(core) || alreadyInTargetLanguage(core, targetLang)) return;
  segments.push({
    kind: "text",
    node,
    lead,
    trail,
    parts: splitForApi(core),
  });
}

export function collectSegments(root, targetLang, options = {}) {
  const segments = [];
  const stack = [root];
  const { skipText, skipAttrs } = options;

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.nodeType === 3) {
      pushText(node, targetLang, segments, skipText);
      continue;
    }
    const type = node.nodeType;
    if (type !== 1 && type !== 9 && type !== 11) continue;

    if (type === 1) {
      const blocked = blocksDescendants(node);
      if (!blocked || node.tagName === "TEXTAREA") {
        collectAttrs(node, targetLang, segments, skipAttrs);
      }
      if (blocked) continue;
    }

    if (node.shadowRoot) stack.push(node.shadowRoot);
    const kids = node.childNodes;
    if (!kids) continue;
    for (let i = kids.length - 1; i >= 0; i -= 1) stack.push(kids[i]);
  }

  return segments;
}

function markAttr(skipAttrs, element, attr) {
  if (!skipAttrs) return;
  let set = skipAttrs.get(element);
  if (!set) {
    set = new Set();
    skipAttrs.set(element, set);
  }
  set.add(attr);
}

export function applySegment(segment, records, options = {}) {
  const core = segment.translatedParts
    .map((part, index) => (typeof part === "string" && part.length > 0 ? part : segment.parts[index]))
    .join("");
  const value = `${segment.lead}${core}${segment.trail}`;

  if (segment.kind === "text") {
    records.push({ kind: "text", node: segment.node, original: segment.node.nodeValue });
    segment.node.nodeValue = value;
    options.skipText?.add(segment.node);
    return;
  }

  records.push({
    kind: "attr",
    element: segment.element,
    attr: segment.attr,
    original: segment.element.getAttribute(segment.attr),
  });
  if (segment.attr === "value") segment.element.value = value;
  segment.element.setAttribute(segment.attr, value);
  markAttr(options.skipAttrs, segment.element, segment.attr);
}

export function restoreRecords(records) {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i];
    if (record.kind === "text") {
      record.node.nodeValue = record.original;
      continue;
    }
    if (record.original == null) {
      record.element.removeAttribute(record.attr);
    } else {
      if (record.attr === "value") record.element.value = record.original;
      record.element.setAttribute(record.attr, record.original);
    }
  }
  records.length = 0;
}
