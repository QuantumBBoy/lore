// Attribute blocks: `{sensitive}`, `{#gift-ideas}`, `{type=lent due=2026-10-15}`,
// `{price="60 EUR"}` (spec section 9.5).

export const LEVELS = ['public', 'private', 'sensitive'];

const KEY = '[a-z][a-z0-9_-]*(?:\\.[a-z][a-z0-9_-]*)*';
const TOKEN = new RegExp(
  `^(?:(public|private|sensitive)|#(${KEY})|(${KEY})=(?:"((?:[^"\\\\]|\\\\.)*)"|([^\\s{}"]+)))(?: |$)`,
);

/**
 * Parse the inside of `{…}`. Returns {attrs, id} or null when it is not a valid attribute block.
 * A bare level is returned as attrs.sensitivity.
 */
export function parseAttributes(inner) {
  if (inner === '' || inner.startsWith(' ') || inner.endsWith(' ')) return null;
  const attrs = {};
  let id = null;
  let rest = inner;
  while (rest.length) {
    const m = TOKEN.exec(rest);
    if (!m) return null;
    const [whole, level, anchor, key, quoted, plain] = m;
    if (level) {
      if ('sensitivity' in attrs) return null;
      attrs.sensitivity = level;
    } else if (anchor) {
      if (id !== null) return null;
      id = anchor;
    } else {
      if (key in attrs) return null;
      attrs[key] = quoted !== undefined ? quoted.replace(/\\(.)/g, '$1') : plain;
    }
    rest = rest.slice(whole.length);
  }
  return { attrs, id };
}

/** Split "text {attrs}" into its parts when the trailing braces are a valid attribute block. */
export function splitTrailingAttributes(line) {
  const m = / \{([^{}]*)\}$/.exec(line);
  if (m) {
    const parsed = parseAttributes(m[1]);
    if (parsed) return { text: line.slice(0, m.index), attrs: parsed.attrs, id: parsed.id };
  }
  return { text: line, attrs: {}, id: null };
}

function formatValue(v) {
  const s = String(v);
  return /^[^\s{}"]+$/.test(s) ? s : `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Format attributes (and an optional section id) as ` {…}`, or '' when there are none. */
export function formatAttributes(attrs = {}, id = null) {
  const tokens = [];
  if (id) tokens.push(`#${id}`);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (!new RegExp(`^${KEY}$`).test(k)) throw new Error(`invalid attribute name "${k}"`);
    if (k === 'sensitivity' && LEVELS.includes(v)) tokens.push(v);
    else tokens.push(`${k}=${formatValue(v)}`);
  }
  return tokens.length ? ` {${tokens.join(' ')}}` : '';
}
