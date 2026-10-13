// What the Gallery app does with the string a JS skill returns. Port of RunJsTool.runJs in
// google-ai-edge/gallery (Android/src/app/src/main/java/com/google/ai/edge/gallery/tools/RunJsTool.kt).
//
// The app parses the string with Moshi using failOnUnknown() into
//   { result: String?, error: String?, image: { base64: String? }?, webview: { url: String?, iframe: Boolean?, aspectRatio: Float? }? }
// If that fails, or result, image and webview are all null, the raw string goes to the model as
// the result. "error" is reported as a failure only when one of the other fields is also set.

const FIELDS = { result: 'string', error: 'string', image: 'object', webview: 'object' };
const NESTED = {
  image: { base64: 'string' },
  webview: { url: 'string', iframe: 'boolean', aspectRatio: 'number' },
};

function moshiParse(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  for (const [key, v] of Object.entries(value)) {
    if (!(key in FIELDS)) return null; // failOnUnknown
    if (v === null) continue;
    if (typeof v !== FIELDS[key] || Array.isArray(v)) return null;
    if (NESTED[key]) {
      for (const [k, inner] of Object.entries(v)) {
        if (!(k in NESTED[key])) return null;
        if (inner !== null && typeof inner !== NESTED[key][k]) return null;
      }
    }
  }
  return value;
}

/**
 * @param {string} raw the string returned by ai_edge_gallery_get_result
 * @returns {{parsed: boolean, status: 'succeeded'|'failed', result?: string, error?: string, webview?: object, image?: object}}
 */
export function appOutcome(raw) {
  const r = moshiParse(raw);
  if (!r || (r.result == null && r.webview == null && r.image == null)) {
    return { parsed: false, status: 'succeeded', result: raw };
  }
  if (r.error != null) return { parsed: true, status: 'failed', error: r.error };
  const out = { parsed: true, status: 'succeeded', result: r.result ?? '' };
  if (r.webview != null) out.webview = r.webview;
  if (r.image != null) out.image = r.image;
  return out;
}
