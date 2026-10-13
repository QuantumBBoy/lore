// Kin's mistake log, for evals. Kin remembers its last call (what the model sent and what Kin
// answered). When the owner says it was wrong, the feedback action stores that call with the
// owner's correction. The backup panel exports the log as JSON Lines (evals/cases.jsonl), with
// people's names replaced by stable placeholders (person_1, person_2…) so it can be published.
// Everything stays in this phone's storage, under lore: keys, until the owner shares it.

import { foldAccents } from '../../lore-core/src/text.mjs';
import { cleanText, looksSensitive, reply } from './shared.mjs';
import { KIN_VERSION } from './version.mjs';

const LAST = 'lore:v1:last';
const CASES = 'lore:v1:feedback';
const NAMES = 'lore:v1:evalnames';
export const MAX_CASES = 500;

const read = (storage, key, fallback) => {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (storage, key, value) => {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // a full storage must not break the answer
  }
};

/** Remember a call: what the model sent and what Kin answered. */
export function recordCall(storage, call) {
  write(storage, LAST, call);
}

export const readLastCall = (storage) => read(storage, LAST, null);
export const readCases = (storage) => read(storage, CASES, []);
export const caseCount = (storage) => readCases(storage).length;

/** feedback: the owner says Kin's last answer was wrong, and how. */
export function feedback(ctx, input) {
  const { t } = ctx;
  const correction = cleanText(input.text ?? input.correction ?? input.feedback);
  if (!correction) return reply(t.needCorrection);
  const last = readLastCall(ctx.storage);
  if (!last) return reply(t.feedbackNone);
  const cases = readCases(ctx.storage);
  const minutes = Math.max(0, Math.round((ctx.now.getTime() - Date.parse(last.ts)) / 60000));
  cases.push({
    id: `${ctx.today}-${String(cases.length + 1).padStart(3, '0')}`,
    ts: ctx.now.toISOString(),
    call_ts: last.ts,
    today: last.today,
    time: last.time,
    lang: last.lang,
    kin: KIN_VERSION,
    spec: ctx.folder.version,
    action: last.action,
    params: last.params,
    result: last.result,
    error: last.error ?? false,
    correction,
    minutes_since_call: minutes,
    fault: 'unknown',
    expected: null,
  });
  write(ctx.storage, CASES, cases.slice(-MAX_CASES));
  return reply(t.feedbackSaved(cases.length, last.action) + (minutes > 30 ? t.feedbackStale(minutes) : ''));
}

// ------------------------------------------------------------------------------------- export

const ACCENTS = { a: 'aáàäâã', e: 'eéèëê', i: 'iíìïî', o: 'oóòöôõ', u: 'uúùüû', n: 'nñ', c: 'cç' };
const escape = (ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A whole-word, case- and accent-insensitive pattern for a name. */
function namePattern(name) {
  const body = [...foldAccents(name).toLowerCase()].map((ch) => (ACCENTS[ch] ? `[${ACCENTS[ch]}]` : escape(ch))).join('');
  return new RegExp(`(?<![\\p{L}\\p{N}_-])${body}(?![\\p{L}\\p{N}_-])`, 'giu');
}

const key = (s) => foldAccents(String(s)).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Placeholders for everyone in the folder, stable across exports: the same person is always
 * person_N on this phone. The owner is "owner".
 */
function placeholders(storage, folder, extraNames) {
  const map = read(storage, NAMES, { slugs: {}, words: {}, next: 1 });
  const variants = [];
  const add = (text, holder) => {
    if (typeof text === 'string' && text.trim().length >= 2) variants.push([text.trim(), holder]);
  };
  for (const slug of folder.slugs()) {
    let data;
    try {
      data = folder.person(slug).data;
    } catch {
      continue;
    }
    map.slugs[slug] ??= `person_${map.next++}`;
    const holder = map.slugs[slug];
    add(slug, holder);
    add(data.name, holder);
    for (const alias of Array.isArray(data.aliases) ? data.aliases : []) add(alias, holder);
    const first = typeof data.name === 'string' ? data.name.split(/\s+/)[0] : null;
    if (first && first.length >= 3) add(first, holder);
  }
  let owner = null;
  try {
    owner = folder.me.data;
  } catch {
    // no owner file: nothing to hide for them
  }
  if (owner) {
    add(owner.name, 'owner');
    for (const alias of Array.isArray(owner.aliases) ? owner.aliases : []) add(alias, 'owner');
  }
  // Names the model used that match nobody in the folder still get a placeholder.
  for (const name of extraNames) {
    const k = key(name);
    if (!k || variants.some(([v]) => key(v) === k)) continue;
    map.words[k] ??= `person_${map.next++}`;
    add(name, map.words[k]);
  }
  write(storage, NAMES, map);
  variants.sort((a, b) => b[0].length - a[0].length);
  return variants.map(([name, holder]) => [namePattern(name), holder]);
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const NUMBERS = /\+?\d[\d\s().-]{6,}\d/g;

function scrub(text, patterns) {
  let out = String(text);
  for (const [re, holder] of patterns) out = out.replace(re, holder);
  out = out.replace(EMAIL, '[email]');
  // Long digit runs are phone numbers; dates (8 digits at most) stay.
  return out.replace(NUMBERS, (m) => (m.replace(/\D/g, '').length >= 9 ? '[phone]' : m));
}

function scrubDeep(value, patterns) {
  if (typeof value === 'string') return scrub(value, patterns);
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, patterns));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubDeep(v, patterns)]));
  return value;
}

const PERSON_PARAMS = ['person', 'name', 'who', 'other'];

/**
 * The log as JSON Lines, one case per line, ready to commit as evals/cases.jsonl. In what the
 * model sent, what Kin answered and the correction, names become placeholders and e-mail
 * addresses and phone numbers are removed. A call that asked for sensitive data, or whose text
 * looks sensitive, keeps none of the three.
 * @returns {{text: string, count: number}}
 */
export function exportCases(storage, folder) {
  const cases = readCases(storage);
  const extra = cases.flatMap((c) => PERSON_PARAMS.map((p) => c.params?.[p]).filter((v) => typeof v === 'string'));
  const patterns = placeholders(storage, folder, extra);
  const lines = cases.map((c) => {
    const sensitive = c.params?.sensitive === true || String(c.params?.sensitive) === 'true' || looksSensitive(c.params?.text ?? '') || looksSensitive(c.correction ?? '');
    const out = { ...c, params: scrubDeep(c.params, patterns), result: scrub(c.result ?? '', patterns), correction: scrub(c.correction ?? '', patterns), sensitive };
    if (sensitive) {
      if (out.params && typeof out.params.text === 'string') out.params.text = '[sensitive]';
      out.result = '[sensitive]';
      out.correction = '[sensitive]';
    }
    return JSON.stringify(out);
  });
  return { text: lines.length ? `${lines.join('\n')}\n` : '', count: lines.length };
}
