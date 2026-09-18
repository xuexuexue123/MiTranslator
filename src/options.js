import { BROWSER_TARGET, DEFAULT_TARGET_LANG, TARGET_LANGUAGES } from "./shared.js";

const select = document.querySelector("#target-lang");
const saved = document.querySelector("#saved");

const followBrowser = document.createElement("option");
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
