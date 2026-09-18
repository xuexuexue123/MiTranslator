import { expect, test } from "bun:test";
import { translateTexts } from "./engine.js";

test("posts batches to Transmart and returns aligned translations", async () => {
  let url = "";
  let body = null;
  const result = await translateTexts(["Hello"], "zh", async (requestUrl, init) => {
    url = String(requestUrl);
    body = JSON.parse(init.body);
    return {
      ok: true,
      async json() {
        return { header: { ret_code: "succ" }, auto_translation: ["你好"] };
      },
    };
  });

  expect(url).toBe("https://transmart.qq.com/api/imt");
  expect(body.source.text_list).toEqual(["Hello"]);
  expect(body.target.lang).toBe("zh");
  expect(result).toEqual(["你好"]);
});
