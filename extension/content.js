(() => {
  // src/shared.js
  var SIMPLIFIED_ONLY = "国这说们来时个会对学体发电无开长门车东书后么还过进爱样种万与业产从众优关实问题现经头软脑湾网讯云为尔";
  var TRADITIONAL_ONLY = "國這說們來時個會對學體發電無開長門車東書後麼還過進愛樣種萬與業產從眾優關實問題現經頭軟腦灣網訊雲為爾";
  var TARGET_LANGUAGES = [
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
    { code: "ar", label: "阿拉伯语" }
  ];
  var TARGET_CODES = new Set(TARGET_LANGUAGES.map((item) => item.code));
  function isTranslatableText(text) {
    if (typeof text !== "string")
      return false;
    const core = text.trim();
    if (core.length < 2)
      return false;
    if (!/\p{L}/u.test(core))
      return false;
    if (/^https?:\/\/\S+$/i.test(core))
      return false;
    if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(core))
      return false;
    return true;
  }
  function hasAny(text, alphabet) {
    for (const char of text) {
      if (alphabet.includes(char))
        return true;
    }
    return false;
  }
  function alreadyInTargetLanguage(text, targetLang) {
    const core = text.trim();
    if (!core)
      return true;
    const lang = String(targetLang || "").toLowerCase();
    const hasLatin = /\p{Script=Latin}/u.test(core);
    const hasHan = /\p{Script=Han}/u.test(core);
    if (lang === "zh" || lang === "zh-tw") {
      if (hasLatin || !hasHan)
        return false;
      if (lang === "zh" && hasAny(core, TRADITIONAL_ONLY))
        return false;
      if (lang === "zh-tw" && hasAny(core, SIMPLIFIED_ONLY))
        return false;
      return true;
    }
    if (lang === "ja") {
      if (hasLatin)
        return false;
      return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(core);
    }
    if (lang === "ko") {
      if (hasLatin)
        return false;
      return /\p{Script=Hangul}/u.test(core);
    }
    return false;
  }
  function splitEdges(text) {
    const lead = /^\s*/.exec(text)?.[0] ?? "";
    const trail = /\s*$/.exec(text)?.[0] ?? "";
    if (lead.length + trail.length >= text.length) {
      return { lead: text, core: "", trail: "" };
    }
    return {
      lead,
      core: text.slice(lead.length, text.length - trail.length),
      trail
    };
  }
  function splitForApi(text, max = 800) {
    if (text.length <= max)
      return [text];
    const parts = [];
    let rest = text;
    while (rest.length > max) {
      const window2 = rest.slice(0, max);
      let cut = -1;
      for (const token of [`
`, "。", "！", "？", ". ", "! ", "? ", "，", " "]) {
        const at = window2.lastIndexOf(token);
        if (at > max * 0.4 && at + token.length > cut)
          cut = at + token.length;
      }
      if (cut < 0)
        cut = max;
      parts.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (rest)
      parts.push(rest);
    return parts;
  }
  function chunkByText(items, { maxItems = 16, maxChars = 2800 } = {}) {
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
    if (current.length > 0)
      chunks.push(current);
    return chunks;
  }

  // src/dom.js
  var BLOCK_TAGS = new Set([
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
    "NOFRAMES"
  ]);
  var TEXT_ATTRS = ["placeholder", "title", "alt", "aria-label"];
  function blocksDescendants(element) {
    if (BLOCK_TAGS.has(element.tagName))
      return true;
    if (element.getAttribute("translate") === "no")
      return true;
    if (element.hasAttribute("data-mi-root"))
      return true;
    const editable = element.getAttribute("contenteditable");
    return editable === "" || editable === "true" || editable === "plaintext-only";
  }
  function attrSkipped(skipAttrs, element, attr) {
    return skipAttrs?.get(element)?.has(attr) ?? false;
  }
  function pushAttr(element, attr, raw, targetLang, segments, skipAttrs) {
    if (raw == null || attrSkipped(skipAttrs, element, attr))
      return;
    const { lead, core, trail } = splitEdges(raw);
    if (!isTranslatableText(core) || alreadyInTargetLanguage(core, targetLang))
      return;
    segments.push({
      kind: "attr",
      element,
      attr,
      lead,
      trail,
      parts: splitForApi(core)
    });
  }
  function collectAttrs(element, targetLang, segments, skipAttrs) {
    for (const attr of TEXT_ATTRS) {
      if (!element.hasAttribute(attr))
        continue;
      pushAttr(element, attr, element.getAttribute(attr), targetLang, segments, skipAttrs);
    }
    if (element.tagName !== "INPUT")
      return;
    const type = (element.getAttribute("type") || "text").toLowerCase();
    if (type !== "button" && type !== "submit" && type !== "reset")
      return;
    if (!element.hasAttribute("value"))
      return;
    pushAttr(element, "value", element.getAttribute("value"), targetLang, segments, skipAttrs);
  }
  function pushText(node, targetLang, segments, skipText) {
    if (skipText?.has(node))
      return;
    const { lead, core, trail } = splitEdges(node.nodeValue ?? "");
    if (!isTranslatableText(core) || alreadyInTargetLanguage(core, targetLang))
      return;
    segments.push({
      kind: "text",
      node,
      lead,
      trail,
      parts: splitForApi(core)
    });
  }
  function collectSegments(root, targetLang, options = {}) {
    const segments = [];
    const stack = [root];
    const { skipText, skipAttrs } = options;
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node)
        continue;
      if (node.nodeType === 3) {
        pushText(node, targetLang, segments, skipText);
        continue;
      }
      const type = node.nodeType;
      if (type !== 1 && type !== 9 && type !== 11)
        continue;
      if (type === 1) {
        const blocked = blocksDescendants(node);
        if (!blocked || node.tagName === "TEXTAREA") {
          collectAttrs(node, targetLang, segments, skipAttrs);
        }
        if (blocked)
          continue;
      }
      if (node.shadowRoot)
        stack.push(node.shadowRoot);
      const kids = node.childNodes;
      if (!kids)
        continue;
      for (let i = kids.length - 1;i >= 0; i -= 1)
        stack.push(kids[i]);
    }
    return segments;
  }
  function markAttr(skipAttrs, element, attr) {
    if (!skipAttrs)
      return;
    let set = skipAttrs.get(element);
    if (!set) {
      set = new Set;
      skipAttrs.set(element, set);
    }
    set.add(attr);
  }
  function applySegment(segment, records, options = {}) {
    const core = segment.translatedParts.map((part, index) => typeof part === "string" && part.length > 0 ? part : segment.parts[index]).join("");
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
      original: segment.element.getAttribute(segment.attr)
    });
    if (segment.attr === "value")
      segment.element.value = value;
    segment.element.setAttribute(segment.attr, value);
    markAttr(options.skipAttrs, segment.element, segment.attr);
  }
  function restoreRecords(records) {
    for (let i = records.length - 1;i >= 0; i -= 1) {
      const record = records[i];
      if (record.kind === "text") {
        record.node.nodeValue = record.original;
        continue;
      }
      if (record.original == null) {
        record.element.removeAttribute(record.attr);
      } else {
        if (record.attr === "value")
          record.element.value = record.original;
        record.element.setAttribute(record.attr, record.original);
      }
    }
    records.length = 0;
  }

  // src/pipeline.js
  function visibilityRank(segment) {
    const element = segment.kind === "text" ? segment.node.parentElement : segment.element;
    if (!element?.getBoundingClientRect)
      return 1;
    try {
      const rect = element.getBoundingClientRect();
      const height = element.ownerDocument?.defaultView?.innerHeight ?? 0;
      if (height > 0 && rect.bottom > 0 && rect.top < height)
        return 0;
    } catch {
      return 1;
    }
    return 1;
  }
  async function runTranslation(root, targetLang, translateFn, hooks = {}) {
    const segments = collectSegments(root, targetLang, hooks);
    for (const segment of segments) {
      segment.translatedParts = new Array(segment.parts.length);
      segment.filled = 0;
      segment.applied = false;
    }
    segments.sort((a, b) => visibilityRank(a) - visibilityRank(b));
    const jobs = [];
    for (const segment of segments) {
      for (let index = 0;index < segment.parts.length; index += 1) {
        jobs.push({ segment, index, text: segment.parts[index] });
      }
    }
    const records = [];
    if (jobs.length === 0)
      return { records, total: 0, done: 0, error: null };
    hooks.onProgress?.(0, jobs.length);
    if (hooks.yield)
      await hooks.yield();
    const chunks = chunkByText(jobs);
    let done = 0;
    let error = null;
    for (const chunk of chunks) {
      if (hooks.shouldStop?.())
        break;
      let translations;
      try {
        translations = await translateFn(chunk.map((job) => job.text), targetLang);
      } catch (caught) {
        error = caught instanceof Error ? caught : new Error(String(caught));
        break;
      }
      if (hooks.shouldStop?.())
        break;
      if (!Array.isArray(translations) || translations.length !== chunk.length) {
        error = new Error("Translation response did not match the request");
        error.code = "mismatch";
        break;
      }
      const touched = new Set;
      for (let i = 0;i < chunk.length; i += 1) {
        const job = chunk[i];
        job.segment.translatedParts[job.index] = translations[i];
        job.segment.filled += 1;
        touched.add(job.segment);
      }
      for (const segment of touched) {
        if (segment.applied || segment.filled !== segment.parts.length)
          continue;
        segment.applied = true;
        applySegment(segment, records, hooks);
      }
      done += chunk.length;
      hooks.onProgress?.(done, jobs.length);
    }
    return { records, total: jobs.length, done, error };
  }

  // src/content.js
  if (!globalThis.__miTranslatorLoaded) {
    let isTopFrame = function() {
      return window.parent === window;
    }, messages = function(uiLanguage) {
      const zh = String(uiLanguage || "").toLowerCase().startsWith("zh");
      if (zh) {
        return {
          preparing: "正在准备翻译…",
          working: (done, total) => `正在翻译… ${done}/${total}`,
          done: "已翻译",
          partial: "部分文字未能翻译",
          original: "显示原文",
          cancel: "取消",
          dismiss: "关闭",
          empty: "没有需要翻译的文字",
          failed: "翻译失败，请检查网络后重试",
          rejected: "翻译服务暂时拒绝了请求，请稍后再试"
        };
      }
      return {
        preparing: "Preparing…",
        working: (done, total) => `Translating… ${done}/${total}`,
        done: "Translated",
        partial: "Some text could not be translated",
        original: "Show original",
        cancel: "Cancel",
        dismiss: "Close",
        empty: "Nothing to translate",
        failed: "Translation failed. Check your network and try again.",
        rejected: "The translation service rejected the request. Try again in a moment."
      };
    }, explain = function(error, ui) {
      const code = error?.code || error?.message || "";
      if (code === "Auth-Failed")
        return ui.rejected;
      return ui.failed;
    }, mountBar = function() {
      const existing = document.getElementById("mi-translator-root");
      if (existing)
        return existing.__miBar;
      const host = document.createElement("div");
      host.id = "mi-translator-root";
      host.dataset.miRoot = "1";
      host.setAttribute("translate", "no");
      for (const [key, value] of Object.entries({
        position: "fixed",
        top: "12px",
        right: "12px",
        "z-index": "2147483647",
        display: "block",
        width: "max-content",
        "max-width": "calc(100vw - 24px)",
        "min-height": "36px",
        "pointer-events": "auto"
      })) {
        host.style.setProperty(key, value, "important");
      }
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `
      <style>
        .bar {
          display: flex;
          align-items: center;
          gap: 10px;
          box-sizing: border-box;
          min-height: 36px;
          padding: 8px 12px;
          border-radius: 999px;
          background: #fff;
          color: #202124;
          border: 1px solid #dadce0;
          box-shadow: 0 1px 2px rgba(60, 64, 67, 0.3), 0 2px 6px rgba(60, 64, 67, 0.15);
          font: 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
        }
        .status { min-width: 0; }
        button {
          border: 0;
          background: transparent;
          color: #1a73e8;
          font: inherit;
          cursor: pointer;
          padding: 0;
          white-space: nowrap;
        }
        button:hover { text-decoration: underline; }
      </style>
      <div class="bar">
        <span class="status" role="status"></span>
        <button type="button" hidden></button>
      </div>
    `;
      const status = shadow.querySelector(".status");
      const button = shadow.querySelector("button");
      shadow.querySelector(".bar").addEventListener("mousedown", (event) => {
        event.stopPropagation();
      });
      const api = {
        setStatus(text) {
          status.textContent = text;
        },
        setAction(label, onClick) {
          if (!label) {
            button.hidden = true;
            button.onclick = null;
            return;
          }
          button.hidden = false;
          button.textContent = label;
          button.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
          };
        },
        remove() {
          host.remove();
        }
      };
      host.__miBar = api;
      (document.documentElement || document.body).appendChild(host);
      return api;
    }, removeBar = function() {
      document.getElementById("mi-translator-root")?.remove();
    }, stopSession = function() {
      epoch += 1;
      session?.observer?.disconnect();
      if (session)
        restoreRecords(session.records);
      session = null;
      removeBar();
    }, startObserver = function() {
      if (!session || !document.documentElement)
        return;
      const observer = new MutationObserver(() => {
        clearTimeout(startObserver.timer);
        startObserver.timer = setTimeout(() => {
          translateIncremental();
        }, 600);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      session.observer = observer;
    };
    globalThis.__miTranslatorLoaded = true;
    let session = null;
    let running = false;
    let epoch = 0;
    let activeEpoch = 0;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "translate-page")
        return;
      togglePage(message.targetLang, message.uiLanguage).then((result) => sendResponse(result), (error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }));
      return true;
    });
    async function requestTranslation(texts, targetLang) {
      const response = await chrome.runtime.sendMessage({
        type: "translate-texts",
        texts,
        targetLang
      });
      if (!response?.ok) {
        const error = new Error(response?.error || "Translation failed");
        error.code = response?.code || response?.error;
        throw error;
      }
      return response.translations;
    }
    async function translateIncremental() {
      if (running || !session)
        return;
      const current = session;
      running = true;
      try {
        const result = await runTranslation(document, current.targetLang, requestTranslation, {
          skipText: current.skipText,
          skipAttrs: current.skipAttrs,
          shouldStop: () => session !== current
        });
        if (session === current)
          current.records.push(...result.records);
      } catch {} finally {
        running = false;
      }
    }
    async function togglePage(targetLang, uiLanguage) {
      const ui = messages(uiLanguage);
      if (running) {
        if (epoch === activeEpoch)
          epoch += 1;
        return { ok: true, status: "cancelled" };
      }
      if (session) {
        stopSession();
        return { ok: true, status: "restored" };
      }
      const myEpoch = epoch;
      activeEpoch = myEpoch;
      running = true;
      const bar = isTopFrame() ? mountBar() : null;
      bar?.setStatus(ui.preparing);
      bar?.setAction(ui.cancel, () => {
        if (epoch === myEpoch)
          epoch += 1;
      });
      try {
        const skipText = new WeakSet;
        const skipAttrs = new WeakMap;
        const result = await runTranslation(document, targetLang, requestTranslation, {
          skipText,
          skipAttrs,
          shouldStop: () => epoch !== myEpoch,
          onProgress(done, total) {
            if (epoch !== myEpoch)
              return;
            bar?.setStatus(total > 0 ? ui.working(done, total) : ui.preparing);
          },
          yield: () => new Promise((resolve) => setTimeout(resolve, 0))
        });
        if (epoch !== myEpoch) {
          restoreRecords(result.records);
          if (epoch === myEpoch + 1)
            removeBar();
          return { ok: true, status: "cancelled" };
        }
        if (result.records.length === 0) {
          bar?.setStatus(result.error ? explain(result.error, ui) : ui.empty);
          bar?.setAction(ui.dismiss, removeBar);
          return { ok: true, status: result.error ? "failed" : "empty" };
        }
        session = {
          records: result.records,
          skipText,
          skipAttrs,
          targetLang,
          observer: null
        };
        startObserver();
        bar?.setStatus(result.error ? ui.partial : ui.done);
        bar?.setAction(ui.original, stopSession);
        return { ok: true, status: result.error ? "partial" : "translated" };
      } catch (error) {
        if (epoch === myEpoch) {
          bar?.setStatus(explain(error, ui));
          bar?.setAction(ui.dismiss, removeBar);
        }
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      } finally {
        running = false;
      }
    }
  }
})();
