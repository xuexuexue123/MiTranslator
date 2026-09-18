(() => {
  // src/shared.js
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

  // src/options.js
  var select = document.querySelector("#target-lang");
  var saved = document.querySelector("#saved");
  var followBrowser = document.createElement("option");
  followBrowser.value = BROWSER_TARGET;
  followBrowser.textContent = "跟随浏览器语言";
  select.append(followBrowser);
  for (const language of TARGET_LANGUAGES) {
    const option = document.createElement("option");
    option.value = language.code;
    option.textContent = language.label;
    select.append(option);
  }
  select.value = DEFAULT_TARGET_LANG;
  document.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await chrome.storage.local.set({ targetLang: select.value });
    saved.hidden = false;
  });
  chrome.storage.local.get({ targetLang: DEFAULT_TARGET_LANG }).then((stored) => {
    if ([BROWSER_TARGET, ...TARGET_LANGUAGES.map((language) => language.code)].includes(stored.targetLang)) {
      select.value = stored.targetLang;
    }
  });
})();
