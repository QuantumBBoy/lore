// Kin's entry point: what window.ai_edge_gallery_get_result calls. It parses what the model sent,
// loads the Lore folder from storage, runs one action, saves only what changed, and answers with
// the JSON the Gallery app expects ({result} or {result, error}, plus an optional webview).

import { today as runtimeToday } from '../../lore-core/src/dates.mjs';
import { LoreError, LoreFolder } from '../../lore-core/src/folder.mjs';
import { ACTIONS, normalizeAction } from './actions.mjs';
import { languageOf, messages } from './messages.mjs';
import { recordCall } from './feedback.mjs';
import { localClock } from './proactive.mjs';
import { hasFolder, loadFolder, needsNudge, readMeta, readSchedule, saveFolder, writeMeta, writeSchedule } from './store.mjs';

const truthy = (v) => v === true || ['true', 'yes', 'si', 'sí', '1'].includes(String(v).toLowerCase().trim());

/** Accept the JSON the SKILL.md asks for, and the near misses small models produce. */
export function parseInput(raw) {
  let input = raw;
  for (let i = 0; i < 3 && typeof input === 'string'; i++) {
    const s = input.trim();
    if (s === '') return {};
    try {
      input = JSON.parse(s);
    } catch {
      throw new LoreError('invalid', 'The data must be a JSON object.');
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new LoreError('invalid', 'The data must be a JSON object.');
  return {
    ...input,
    person: input.person ?? input.name ?? input.who,
    text: input.text ?? input.value ?? input.note,
    lang: input.lang ?? input.language,
    confirm: truthy(input.confirm),
    sensitive: truthy(input.sensitive),
  };
}

function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** What the model sent, as it sent it (for the mistake log): the object, or the raw text. */
function rawParams(data) {
  let value = data;
  for (let i = 0; i < 3 && typeof value === 'string'; i++) {
    try {
      value = JSON.parse(value.trim());
    } catch {
      return { raw: String(data).slice(0, 500) };
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : { raw: String(data).slice(0, 500) };
}

/**
 * Run one request.
 * @param {string} data the JSON string from the app
 * @param {{storage: Storage, now?: Date}} env
 * @returns {string} JSON for the app
 */
export function handle(data, { storage, now = new Date() }) {
  const call = { today: runtimeToday({ now }), lang: 'en', action: null };
  const json = respond(data, storage, now, call);
  // Remember this call, so the owner can say it was wrong (feedback).
  if (call.action !== 'feedback') {
    const out = JSON.parse(json);
    const clock = localClock(now);
    recordCall(storage, {
      ts: now.toISOString(),
      today: call.today,
      time: `${String(Math.floor(clock.minutes / 60)).padStart(2, '0')}:${String(clock.minutes % 60).padStart(2, '0')}`,
      lang: call.lang,
      action: call.action,
      params: rawParams(data),
      result: out.result,
      error: Boolean(out.error),
    });
  }
  return json;
}

function respond(data, storage, now, call) {
  let t = messages('en');
  try {
    const input = parseInput(data);
    const today = call.today;
    const exists = hasFolder(storage);
    const { folder, snapshot } = exists ? loadFolder(storage) : { folder: new LoreFolder(), snapshot: new Map() };
    const lang = languageOf(input.lang ?? folder.setting('language') ?? 'en');
    call.lang = lang;
    t = messages(lang);

    const action = normalizeAction(input.action);
    call.action = action ?? (typeof input.action === 'string' ? input.action : null);
    if (!action) return answer(t.unknownAction(input.action ?? '', Object.keys(ACTIONS)));
    // "calendar" as the action means exporting dates to the calendar.
    if (action === 'remind' && /^(calendar|calendario|ics)$/i.test(String(input.action).trim())) input.calendar = true;
    const spec = ACTIONS[action];
    if (!exists && !spec.writes && !spec.withoutData) return answer(t.noData);
    // A folder from a newer spec version is read, never written (spec section 13).
    if (exists && spec.writes && !folder.writable) return answer(t.unsupportedVersion(folder.version));

    let fresh = folder;
    if (!exists && spec.writes) {
      fresh = LoreFolder.create({ name: lang === 'es' ? 'Yo' : 'Me', language: lang, timezone: deviceTimeZone() });
    }
    const meta = readMeta(storage);
    const schedule = readSchedule(storage);
    const clock = localClock(now);
    const ctx = { folder: fresh, today, now, clock, lang, t, meta, schedule, storage, confirm: input.confirm, includeSensitive: input.sensitive };
    const out = spec.run(ctx, input);
    if (ctx.scheduleChanged) writeSchedule(storage, schedule, today);

    let text = out.text;
    if (fresh.changes > 0) {
      fresh.regenerateIndex({ now });
      saveFolder(storage, fresh, exists ? snapshot : new Map());
      meta.firstUse ??= today;
      meta.changesSinceExport += 1; // one per action that changed something
    }
    if (exists || fresh.changes > 0) {
      const everyDays = Number(fresh.setting('kin.export_every_days')) || 30;
      const everyChanges = Number(fresh.setting('kin.export_every_changes')) || 20;
      // The backup panel and the summary speak about backups themselves.
      if (action !== 'backup' && action !== 'digest' && needsNudge(meta, today, { everyDays, everyChanges })) {
        text += `\n${t.nudge}`;
        meta.lastNudge = today;
      }
      writeMeta(storage, meta);
    }
    return answer(text, out.webview);
  } catch (e) {
    const message = e instanceof LoreError && e.code === 'storage-full' ? t.storageFull : t.failed(e.message);
    return JSON.stringify({ result: message, error: message });
  }
}

function answer(result, webview) {
  return JSON.stringify(webview ? { result, webview } : { result });
}
