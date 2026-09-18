// Transmart rejects keys that do not look like a browser client key.
export const TRANSMART_CLIENT_KEY = "browser-chrome-131.0.0-Mac_OS-zh-CN";

const SIMPLIFIED_ONLY =
  "国这说们来时个会对学体发电无开长门车东书后么还过进爱样种万与业产从众优关实问题现经头软脑湾网讯云为尔";
const TRADITIONAL_ONLY =
  "國這說們來時個會對學體發電無開長門車東書後麼還過進愛樣種萬與業產從眾優關實問題現經頭軟腦灣網訊雲為爾";

export function toTargetLang(uiLanguage) {
  const lower = String(uiLanguage || "en")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");
  if (lower.startsWith("zh")) {
    if (
      lower.includes("tw") ||
      lower.includes("hk") ||
      lower.includes("mo") ||
      lower.includes("hant")
    ) {
      return "zh-TW";
    }
    return "zh";
  }
  const primary = lower.split("-")[0];
  return /^[a-z]{2,3}$/.test(primary) ? primary : "en";
}

export const DEFAULT_TARGET_LANG = "zh";
export const BROWSER_TARGET = "browser";

export const TARGET_LANGUAGES = [
  { code: "zh", label: "简体中文" },
  { code: "zh-TW", label: "繁体中文" },
  { code: "en", label: "英语" },
  { code: "ja", label: "日语" },
  { code: "ko", label: "韩语" },
  { code: "fr", label: "法语" },
  { code: "de", label: "德语" },
  { code: "es", label: "西班牙语" },
  { code: "ru", label: "俄语" },
  { code: "pt", label: "葡萄牙语" },
  { code: "it", label: "意大利语" },
  { code: "vi", label: "越南语" },
  { code: "th", label: "泰语" },
  { code: "id", label: "印尼语" },
  { code: "ar", label: "阿拉伯语" },
];

const TARGET_CODES = new Set(TARGET_LANGUAGES.map((item) => item.code));

export function resolveTargetLang(setting, uiLanguage) {
  if (setting === BROWSER_TARGET) return toTargetLang(uiLanguage);
  if (typeof setting === "string" && TARGET_CODES.has(setting)) return setting;
  return DEFAULT_TARGET_LANG;
}

export function isTranslatableText(text) {
  if (typeof text !== "string") return false;
  const core = text.trim();
  if (core.length < 2) return false;
  if (!/\p{L}/u.test(core)) return false;
  if (/^https?:\/\/\S+$/i.test(core)) return false;
  if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(core)) return false;
  return true;
}

function hasAny(text, alphabet) {
  for (const char of text) {
    if (alphabet.includes(char)) return true;
  }
  return false;
}

export function alreadyInTargetLanguage(text, targetLang) {
  const core = text.trim();
  if (!core) return true;
  const lang = String(targetLang || "").toLowerCase();
  const hasLatin = /\p{Script=Latin}/u.test(core);
  const hasHan = /\p{Script=Han}/u.test(core);

  if (lang === "zh" || lang === "zh-tw") {
    if (hasLatin || !hasHan) return false;
    if (lang === "zh" && hasAny(core, TRADITIONAL_ONLY)) return false;
    if (lang === "zh-tw" && hasAny(core, SIMPLIFIED_ONLY)) return false;
    return true;
  }
  if (lang === "ja") {
    if (hasLatin) return false;
    return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(core);
  }
  if (lang === "ko") {
    if (hasLatin) return false;
    return /\p{Script=Hangul}/u.test(core);
  }
  return false;
}

export function splitEdges(text) {
  const lead = /^\s*/.exec(text)?.[0] ?? "";
  const trail = /\s*$/.exec(text)?.[0] ?? "";
  if (lead.length + trail.length >= text.length) {
    return { lead: text, core: "", trail: "" };
  }
  return {
    lead,
    core: text.slice(lead.length, text.length - trail.length),
    trail,
  };
}

export function splitForApi(text, max = 800) {
  if (text.length <= max) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = -1;
    for (const token of ["\n", "。", "！", "？", ". ", "! ", "? ", "，", " "]) {
      const at = window.lastIndexOf(token);
      if (at > max * 0.4 && at + token.length > cut) cut = at + token.length;
    }
    if (cut < 0) cut = max;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) parts.push(rest);
  return parts;
}

export function chunkByText(items, { maxItems = 16, maxChars = 2800 } = {}) {
  const chunks = [];
  let current = [];
  let chars = 0;
  for (const item of items) {
    const len = item.text.length;
    if (current.length > 0 && (current.length >= maxItems || chars + len > maxChars)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += len;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function buildPayload(texts, targetLang) {
  return {
    header: {
      fn: "auto_translation",
      client_key: TRANSMART_CLIENT_KEY,
    },
    type: "plain",
    model_category: "normal",
    source: {
      lang: "auto",
      text_list: texts,
    },
    target: {
      lang: targetLang,
    },
  };
}

export function readTranslations(payload, expectedCount) {
  const code = payload?.header?.ret_code;
  if (code !== "succ" || !Array.isArray(payload.auto_translation)) {
    const error = new Error(code || "Translation failed");
    error.code = code || "bad-response";
    throw error;
  }
  if (payload.auto_translation.length !== expectedCount) {
    const error = new Error("Translation response did not match the request");
    error.code = "mismatch";
    throw error;
  }
  return payload.auto_translation.map((item) => (typeof item === "string" ? item : ""));
}
