import { runTranslation } from "./pipeline.js";
import { restoreRecords } from "./dom.js";

if (!globalThis.__miTranslatorLoaded) {
  globalThis.__miTranslatorLoaded = true;

  let session = null;
  let running = false;
  let epoch = 0;
  let activeEpoch = 0;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "translate-page") return undefined;
    togglePage(message.targetLang, message.uiLanguage).then(
      (result) => sendResponse(result),
      (error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
    );
    return true;
  });

  function isTopFrame() {
    return window.parent === window;
  }

  function messages(uiLanguage) {
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
        rejected: "翻译服务暂时拒绝了请求，请稍后再试",
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
      rejected: "The translation service rejected the request. Try again in a moment.",
    };
  }

  function explain(error, ui) {
    const code = error?.code || error?.message || "";
    if (code === "Auth-Failed") return ui.rejected;
    return ui.failed;
  }

  function mountBar() {
    const existing = document.getElementById("mi-translator-root");
    if (existing) return existing.__miBar;

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
      "pointer-events": "auto",
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
      },
    };
    host.__miBar = api;
    (document.documentElement || document.body).appendChild(host);
    return api;
  }

  function removeBar() {
    document.getElementById("mi-translator-root")?.remove();
  }

  async function requestTranslation(texts, targetLang) {
    const response = await chrome.runtime.sendMessage({
      type: "translate-texts",
      texts,
      targetLang,
    });
    if (!response?.ok) {
      const error = new Error(response?.error || "Translation failed");
      error.code = response?.code || response?.error;
      throw error;
    }
    return response.translations;
  }

  function stopSession() {
    epoch += 1;
    session?.observer?.disconnect();
    if (session) restoreRecords(session.records);
    session = null;
    removeBar();
  }

  function startObserver() {
    if (!session || !document.documentElement) return;
    const observer = new MutationObserver(() => {
      clearTimeout(startObserver.timer);
      startObserver.timer = setTimeout(() => {
        void translateIncremental();
      }, 600);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    session.observer = observer;
  }

  async function translateIncremental() {
    if (running || !session) return;
    const current = session;
    running = true;
    try {
      const result = await runTranslation(document, current.targetLang, requestTranslation, {
        skipText: current.skipText,
        skipAttrs: current.skipAttrs,
        shouldStop: () => session !== current,
      });
      if (session === current) current.records.push(...result.records);
    } catch {
      // Keep the page as it is. The next mutation can try again.
    } finally {
      running = false;
    }
  }

  async function togglePage(targetLang, uiLanguage) {
    const ui = messages(uiLanguage);
    if (running) {
      if (epoch === activeEpoch) epoch += 1;
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
      if (epoch === myEpoch) epoch += 1;
    });

    try {
      const skipText = new WeakSet();
      const skipAttrs = new WeakMap();
      const result = await runTranslation(document, targetLang, requestTranslation, {
        skipText,
        skipAttrs,
        shouldStop: () => epoch !== myEpoch,
        onProgress(done, total) {
          if (epoch !== myEpoch) return;
          bar?.setStatus(total > 0 ? ui.working(done, total) : ui.preparing);
        },
        yield: () => new Promise((resolve) => setTimeout(resolve, 0)),
      });

      if (epoch !== myEpoch) {
        restoreRecords(result.records);
        if (epoch === myEpoch + 1) removeBar();
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
        observer: null,
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
