import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { restoreRecords } from "./dom.js";
import { runTranslation } from "./pipeline.js";

function page(html) {
  return parseHTML(`<!doctype html><html><head><title>Hello Title</title></head><body>${html}</body></html>`)
    .document;
}

describe("runTranslation", () => {
  test("replaces page text, keeps code, and can restore", async () => {
    const document = page(`
      <p> Hello world </p>
      <pre>code stays</pre>
      <button>Save</button>
      <input placeholder="Email address">
      <input type="text" value="secret">
      <input type="submit" value="Search">
      <div contenteditable="true">Edit me please</div>
      <script>var secret = "Hello world"</script>
    `);

    const { records } = await runTranslation(document, "zh", async (texts) =>
      texts.map((text) => `《${text}》`),
    );

    expect(document.querySelector("p").textContent).toBe(" 《Hello world》 ");
    expect(document.querySelector("pre").textContent).toBe("code stays");
    expect(document.querySelector("button").textContent).toBe("《Save》");
    expect(document.querySelector("input").getAttribute("placeholder")).toBe("《Email address》");
    expect(document.querySelector("input[type='text']").getAttribute("value")).toBe("secret");
    expect(document.querySelector("input[type='submit']").getAttribute("value")).toBe("《Search》");
    expect(document.querySelector("[contenteditable]").textContent).toBe("Edit me please");
    expect(document.querySelector("script").textContent).toContain("Hello world");
    expect(document.querySelector("title").textContent).toBe("《Hello Title》");

    restoreRecords(records);
    expect(document.querySelector("p").textContent).toBe(" Hello world ");
    expect(document.querySelector("title").textContent).toBe("Hello Title");
    expect(document.querySelector("input").getAttribute("placeholder")).toBe("Email address");
  });

  test("does not send text that is already simplified Chinese", async () => {
    const document = page(`<p>你好，世界</p><p>Hello there</p>`);
    const seen = [];
    await runTranslation(document, "zh", async (texts) => {
      seen.push(...texts);
      return texts.map((text) => `《${text}》`);
    });
    expect(seen).toContain("Hello there");
    expect(seen).not.toContain("你好，世界");
    expect(document.body.textContent).toContain("你好，世界");
    expect(document.body.textContent).toContain("《Hello there》");
  });

  test("does not apply the in-flight chunk after cancellation", async () => {
    const document = page(`<p>${"Hello world. ".repeat(30)}</p>`);
    let calls = 0;
    const { records } = await runTranslation(
      document,
      "en",
      async (texts) => {
        calls += 1;
        return texts.map((text) => text.toUpperCase());
      },
      {
        shouldStop: () => calls > 0,
      },
    );
    expect(calls).toBe(1);
    expect(records).toHaveLength(0);
    expect(document.querySelector("p").textContent).toContain("Hello world");
  });
});
