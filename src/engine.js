import { buildPayload, readTranslations } from "./shared.js";

// Tencent Transmart's web endpoint. No API key, and it is reachable in
// mainland China. The client_key has to look like a browser key or the
// service returns Auth-Failed. This endpoint is unofficial and can change.
const ENDPOINT = "https://transmart.qq.com/api/imt";

export async function translateTexts(texts, targetLang, fetchImpl = globalThis.fetch) {
  if (texts.length === 0) return [];
  const response = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildPayload(texts, targetLang)),
    signal:
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(25000)
        : undefined,
  });
  if (!response.ok) {
    const error = new Error(`Translation service returned ${response.status}`);
    error.code = String(response.status);
    throw error;
  }
  return readTranslations(await response.json(), texts.length);
}
