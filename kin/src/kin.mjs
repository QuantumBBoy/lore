// Kin's entry point: what window.ai_edge_gallery_get_result calls. It parses what the model sent,
// loads the Lore folder from storage, runs one action, saves only what changed, and answers with
// the JSON the Gallery app expects ({result} or {result, error}, plus an optional webview).

import { today as runtimeToday } from '../../lore-core/src/dates.mjs';
import { LoreError, LoreFolder } from '../../lore-core/src/folder.mjs';
import { ACTIONS, normalizeAction } from './actions.mjs';
import { languageOf, messages } from './messages.mjs';
import { hasFolder, loadFolder, needsNudge, readMeta, saveFolder, writeMeta } from './store.mjs';

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

/**
 * Run one request.
 * @param {string} data the JSON string from the app
 * @param {{storage: Storage, now?: Date}} env
 * @returns {string} JSON for the app
 */
export function handle(data, { storage, now = new Date() }) {
  let t = messages('en');
  try {
    const input = parseInput(data);
    const today = runtimeToday({ now });
    const exists = hasFolder(storage);
    const { folder, snapshot } = exists ? loadFolder(storage) : { folder: new LoreFolder(), snapshot: new Map() };
    const lang = languageOf(input.lang ?? folder.setting('language') ?? 'en');
    t = messages(lang);

    const action = normalizeAction(input.action);
    if (!action) return answer(t.unknownAction(input.action ?? '', Object.keys(ACTIONS)));
    const spec = ACTIONS[action];
    if (!exists && !spec.writes && action !== 'backup') return answer(t.noData);

    let fresh = folder;
    if (!exists && spec.writes) {
      fresh = LoreFolder.create({ name: lang === 'es' ? 'Yo' : 'Me', language: lang, timezone: deviceTimeZone() });
    }
    const meta = readMeta(storage);
    const ctx = { folder: fresh, today, lang, t, meta, confirm: input.confirm, includeSensitive: input.sensitive };
    const out = spec.run(ctx, input);

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
      if (action !== 'backup' && needsNudge(meta, today, { everyDays, everyChanges })) {
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
