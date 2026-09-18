import { applySegment, collectSegments } from "./dom.js";
import { chunkByText } from "./shared.js";

function visibilityRank(segment) {
  const element = segment.kind === "text" ? segment.node.parentElement : segment.element;
  if (!element?.getBoundingClientRect) return 1;
  try {
    const rect = element.getBoundingClientRect();
    const height = element.ownerDocument?.defaultView?.innerHeight ?? 0;
    if (height > 0 && rect.bottom > 0 && rect.top < height) return 0;
  } catch {
    return 1;
  }
  return 1;
}

export async function runTranslation(root, targetLang, translateFn, hooks = {}) {
  const segments = collectSegments(root, targetLang, hooks);
  for (const segment of segments) {
    segment.translatedParts = new Array(segment.parts.length);
    segment.filled = 0;
    segment.applied = false;
  }
  segments.sort((a, b) => visibilityRank(a) - visibilityRank(b));

  const jobs = [];
  for (const segment of segments) {
    for (let index = 0; index < segment.parts.length; index += 1) {
      jobs.push({ segment, index, text: segment.parts[index] });
    }
  }

  const records = [];
  if (jobs.length === 0) return { records, total: 0, done: 0, error: null };

  hooks.onProgress?.(0, jobs.length);
  if (hooks.yield) await hooks.yield();

  const chunks = chunkByText(jobs);
  let done = 0;
  let error = null;

  for (const chunk of chunks) {
    if (hooks.shouldStop?.()) break;
    let translations;
    try {
      translations = await translateFn(
        chunk.map((job) => job.text),
        targetLang,
      );
    } catch (caught) {
      error = caught instanceof Error ? caught : new Error(String(caught));
      break;
    }
    if (hooks.shouldStop?.()) break;
    if (!Array.isArray(translations) || translations.length !== chunk.length) {
      error = new Error("Translation response did not match the request");
      error.code = "mismatch";
      break;
    }

    const touched = new Set();
    for (let i = 0; i < chunk.length; i += 1) {
      const job = chunk[i];
      job.segment.translatedParts[job.index] = translations[i];
      job.segment.filled += 1;
      touched.add(job.segment);
    }
    for (const segment of touched) {
      if (segment.applied || segment.filled !== segment.parts.length) continue;
      segment.applied = true;
      applySegment(segment, records, hooks);
    }
    done += chunk.length;
    hooks.onProgress?.(done, jobs.length);
  }

  return { records, total: jobs.length, done, error };
}
