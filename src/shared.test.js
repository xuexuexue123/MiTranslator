import { describe, expect, test } from "bun:test";
import {
  alreadyInTargetLanguage,
  buildPayload,
  chunkByText,
  isTranslatableText,
  readTranslations,
  splitEdges,
  splitForApi,
  resolveTargetLang,
  toTargetLang,
} from "./shared.js";

describe("toTargetLang", () => {
  test("maps the browser UI language onto Transmart codes", () => {
    expect(toTargetLang("zh-CN")).toBe("zh");
    expect(toTargetLang("zh-Hans")).toBe("zh");
    expect(toTargetLang("zh-TW")).toBe("zh-TW");
    expect(toTargetLang("zh-HK")).toBe("zh-TW");
    expect(toTargetLang("en-US")).toBe("en");
    expect(toTargetLang("ja")).toBe("ja");
    expect(toTargetLang("pt-BR")).toBe("pt");
  });
});

describe("resolveTargetLang", () => {
  test("defaults to simplified Chinese and can follow the browser", () => {
    expect(resolveTargetLang(undefined, "en-US")).toBe("zh");
    expect(resolveTargetLang("zh", "en-US")).toBe("zh");
    expect(resolveTargetLang("en", "zh-CN")).toBe("en");
    expect(resolveTargetLang("browser", "zh-TW")).toBe("zh-TW");
    expect(resolveTargetLang("browser", "ja-JP")).toBe("ja");
    expect(resolveTargetLang("not-a-lang", "en-US")).toBe("zh");
  });
});

describe("isTranslatableText", () => {
  test("skips whitespace, numbers, urls, and emails", () => {
    expect(isTranslatableText("  ")).toBe(false);
    expect(isTranslatableText("12")).toBe(false);
    expect(isTranslatableText("https://example.com/a")).toBe(false);
    expect(isTranslatableText("a@b.co")).toBe(false);
    expect(isTranslatableText("Hi")).toBe(true);
    expect(isTranslatableText("你好")).toBe(true);
  });
});

describe("alreadyInTargetLanguage", () => {
  test("skips text that is already in the target language", () => {
    expect(alreadyInTargetLanguage("你好，世界", "zh")).toBe(true);
    expect(alreadyInTargetLanguage("软件工程", "zh")).toBe(true);
    expect(alreadyInTargetLanguage("軟體工程", "zh")).toBe(false);
    expect(alreadyInTargetLanguage("软件工程", "zh-TW")).toBe(false);
    expect(alreadyInTargetLanguage("軟體工程", "zh-TW")).toBe(true);
    expect(alreadyInTargetLanguage("Hello", "zh")).toBe(false);
    expect(alreadyInTargetLanguage("下载 App", "zh")).toBe(false);
    expect(alreadyInTargetLanguage("こんにちは", "ja")).toBe(true);
    expect(alreadyInTargetLanguage("Hello", "ja")).toBe(false);
    expect(alreadyInTargetLanguage("안녕하세요", "ko")).toBe(true);
    expect(alreadyInTargetLanguage("Bonjour", "en")).toBe(false);
  });
});

describe("splitting", () => {
  test("keeps surrounding whitespace out of the translated core", () => {
    expect(splitEdges("  Hello  ")).toEqual({ lead: "  ", core: "Hello", trail: "  " });
    expect(splitEdges("Hello")).toEqual({ lead: "", core: "Hello", trail: "" });
  });

  test("splits long text on a nearby break", () => {
    const parts = splitForApi(`${"word ".repeat(200)}end`, 80);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")).toBe(`${"word ".repeat(200)}end`);
  });

  test("chunks by count and characters", () => {
    const items = Array.from({ length: 5 }, (_, index) => ({ text: "x".repeat(10), index }));
    expect(chunkByText(items, { maxItems: 2, maxChars: 100 })).toHaveLength(3);
    expect(chunkByText(items, { maxItems: 10, maxChars: 25 })).toHaveLength(3);
  });
});

describe("transmart payload", () => {
  test("builds an auto-detect request and rejects a bad response", () => {
    const payload = buildPayload(["Hello"], "zh");
    expect(payload.source.lang).toBe("auto");
    expect(payload.source.text_list).toEqual(["Hello"]);
    expect(payload.target.lang).toBe("zh");
    expect(readTranslations({ header: { ret_code: "succ" }, auto_translation: ["你好"] }, 1)).toEqual([
      "你好",
    ]);
    expect(() => readTranslations({ header: { ret_code: "Auth-Failed" } }, 1)).toThrow("Auth-Failed");
  });
});
