import { DEFAULT_TARGET_LANG, resolveTargetLang } from "./shared.js";
import { translateTexts } from "./engine.js";

const MENU_ID = "translate-page";

function ensureMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Translate this page",
      contexts: ["page", "selection", "link", "editable", "image", "video", "audio", "frame"],
    });
  });
}

chrome.runtime.onInstalled.addListener(ensureMenu);
chrome.runtime.onStartup.addListener(ensureMenu);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab) void dispatch(tab);
});

chrome.action.onClicked.addListener((tab) => {
  void dispatch(tab);
});

async function translateWithRetry(texts, targetLang) {
  let lastError = new Error("Translation failed");
  for (let attempt = 0; attempt < 2; attempt += 1) {
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
        files: ["content.js"],
      });
      return await chrome.tabs.sendMessage(tabId, message, { frameId });
    } catch {
      return null;
    }
  }
}

async function dispatch(tab) {
  if (tab.id == null) return;
  const uiLanguage = chrome.i18n.getUILanguage();
  const stored = await chrome.storage.local.get({ targetLang: DEFAULT_TARGET_LANG });
  const targetLang = resolveTargetLang(stored.targetLang, uiLanguage);
  const message = { type: "translate-page", targetLang, uiLanguage };

  let frames = [];
  try {
    frames = (await chrome.webNavigation.getAllFrames({ tabId: tab.id })) ?? [];
  } catch {
    frames = [];
  }
  const targets = frames.filter((frame) => !frame.errorOccurred);
  if (targets.length === 0) targets.push({ frameId: 0 });

  const results = await Promise.all(
    targets.map((frame) => deliver(tab.id, frame.frameId, message)),
  );
  const delivered = results.some((result) => result?.ok);
  const zh = uiLanguage.toLowerCase().startsWith("zh");
  if (!delivered) {
    await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#d93025" });
    await chrome.action.setTitle({
      tabId: tab.id,
      title: zh
        ? "这个页面不能翻译（浏览器不允许在这里注入扩展）"
        : "This page can't be translated. Chrome blocks extensions here.",
    });
    return;
  }
  await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  await chrome.action.setTitle({ tabId: tab.id, title: "Translate this page" });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "translate-texts") return undefined;
  translateWithRetry(message.texts, message.targetLang).then(
    (translations) => sendResponse({ ok: true, translations }),
    (error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        code: error?.code,
      }),
  );
  return true;
});
