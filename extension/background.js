(() => {
  // src/shared.js
  var TRANSMART_CLIENT_KEY = "browser-chrome-131.0.0-Mac_OS-zh-CN";
  function toTargetLang(uiLanguage) {
    const lower = String(uiLanguage || "en").trim().toLowerCase().replaceAll("_", "-");
    if (lower.startsWith("zh")) {
      if (lower.includes("tw") || lower.includes("hk") || lower.includes("mo") || lower.includes("hant")) {
        return "zh-TW";
      }
      return "zh";
    }
    const primary = lower.split("-")[0];
    return /^[a-z]{2,3}$/.test(primary) ? primary : "en";
  }
  var DEFAULT_TARGET_LANG = "zh";
  var BROWSER_TARGET = "browser";
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
  function resolveTargetLang(setting, uiLanguage) {
    if (setting === BROWSER_TARGET)
      return toTargetLang(uiLanguage);
    if (typeof setting === "string" && TARGET_CODES.has(setting))
      return setting;
    return DEFAULT_TARGET_LANG;
  }
  function buildPayload(texts, targetLang) {
    return {
      header: {
        fn: "auto_translation",
        client_key: TRANSMART_CLIENT_KEY
      },
      type: "plain",
      model_category: "normal",
      source: {
        lang: "auto",
        text_list: texts
      },
      target: {
        lang: targetLang
      }
    };
  }
  function readTranslations(payload, expectedCount) {
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
    return payload.auto_translation.map((item) => typeof item === "string" ? item : "");
  }

  // src/engine.js
  var ENDPOINT = "https://transmart.qq.com/api/imt";
  async function translateTexts(texts, targetLang, fetchImpl = globalThis.fetch) {
    if (texts.length === 0)
      return [];
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(texts, targetLang)),
      signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(25000) : undefined
    });
    if (!response.ok) {
      const error = new Error(`Translation service returned ${response.status}`);
      error.code = String(response.status);
      throw error;
    }
    return readTranslations(await response.json(), texts.length);
  }

  // src/background.js
  var MENU_ID = "translate-page";
  function ensureMenu() {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_ID,
        title: "Translate this page",
        contexts: ["page", "selection", "link", "editable", "image", "video", "audio", "frame"]
      });
    });
  }
  chrome.runtime.onInstalled.addListener(ensureMenu);
  chrome.runtime.onStartup.addListener(ensureMenu);
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_ID && tab)
      dispatch(tab);
  });
  chrome.action.onClicked.addListener((tab) => {
    dispatch(tab);
  });
  async function translateWithRetry(texts, targetLang) {
    let lastError = new Error("Translation failed");
    for (let attempt = 0;attempt < 2; attempt += 1) {
      try {
        return await translateTexts(texts, targetLang);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
    throw lastError;
  }
  async function deliver(tabId, frameId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message, { frameId });
    } catch {
      try {
        await chrome.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          files: ["content.js"]
        });
        return await chrome.tabs.sendMessage(tabId, message, { frameId });
      } catch {
        return null;
      }
    }
  }
  async function dispatch(tab) {
    if (tab.id == null)
      return;
    const uiLanguage = chrome.i18n.getUILanguage();
    const stored = await chrome.storage.local.get({ targetLang: DEFAULT_TARGET_LANG });
    const targetLang = resolveTargetLang(stored.targetLang, uiLanguage);
    const message = { type: "translate-page", targetLang, uiLanguage };
    let frames = [];
    try {
      frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }) ?? [];
    } catch {
      frames = [];
    }
    const targets = frames.filter((frame) => !frame.errorOccurred);
    if (targets.length === 0)
      targets.push({ frameId: 0 });
    const results = await Promise.all(targets.map((frame) => deliver(tab.id, frame.frameId, message)));
    const delivered = results.some((result) => result?.ok);
    const zh = uiLanguage.toLowerCase().startsWith("zh");
    if (!delivered) {
      await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
      await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#d93025" });
      await chrome.action.setTitle({
        tabId: tab.id,
        title: zh ? "这个页面不能翻译（浏览器不允许在这里注入扩展）" : "This page can't be translated. Chrome blocks extensions here."
      });
      return;
    }
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    await chrome.action.setTitle({ tabId: tab.id, title: "Translate this page" });
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "translate-texts")
      return;
    translateWithRetry(message.texts, message.targetLang).then((translations) => sendResponse({ ok: true, translations }), (error) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      code: error?.code
    }));
    return true;
  });
})();
