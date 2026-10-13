// How Kin reads what the model sent, without touching any data: which action, which kind, which
// date or period the words mean, which lead time or time of day. This is the deterministic part of
// a logged mistake (feedback.mjs), so tools/replay-evals.mjs can check it again after a fix. What
// the model chose (the action, the person, the words it passed) can only be re-run on the phone.

import { normalizeAction, normalizeField, normalizeKind, parseCadence, parseLinkType, captureDirection } from './actions.mjs';
import { parseInput } from './kin.mjs';
import { groupWord, parseClock, parseEvery, parseLead } from './settings.mjs';
import { resolvePeriod, resolveWhen } from './when.mjs';

/**
 * @param {object|string} params what the model sent
 * @param {string} today YYYY-MM-DD of the call
 * @returns {object} only the keys that apply: action, kind, date, contact, days, field, value,
 *   type, group, lead, at, every, calendar
 */
export function interpret(params, today) {
  let input;
  try {
    input = parseInput(typeof params === 'string' ? params : JSON.stringify(params));
  } catch {
    return { action: null, parse: 'invalid' };
  }
  const lang = input.lang ?? 'en';
  const out = { action: normalizeAction(input.action) };
  if (out.action === 'remind' && /^(calendar|calendario|ics)$/i.test(String(input.action).trim())) out.calendar = true;
  switch (out.action) {
    case 'capture': {
      const k = input.kind === undefined || input.kind === null || input.kind === '' ? { kind: 'note', sub: null } : normalizeKind(input.kind);
      out.kind = k ? (k.sub ? `${k.kind}:${k.sub}` : k.kind) : null;
      if (k && input.date) {
        out.date = resolveWhen(input.date, today, { direction: k.kind === 'date' ? 'yearless' : captureDirection(k.kind), lang });
      }
      // The day the owner was in touch, as capture records it.
      const when = out.date ?? (k?.kind === 'note' && !input.date ? today : null);
      out.contact = k && k.kind !== 'date' && when && when.length === 10 && when <= today ? when : null;
      break;
    }
    case 'upcoming':
      out.days = Math.min(366, resolvePeriod(input.days ?? input.period ?? input.when, today) ?? 30);
      break;
    case 'update': {
      out.field = normalizeField(input.field);
      const value = input.value ?? input.text;
      if (out.field === 'cadence') out.value = parseCadence(value);
      else if (out.field === 'birthday') out.value = resolveWhen(value, today, { direction: 'yearless', lang });
      else if (out.field === 'last_contact') out.value = resolveWhen(value, today, { direction: 'past', lang });
      break;
    }
    case 'link':
      out.type = parseLinkType(input.type);
      break;
    case 'remind':
      out.group = input.person ? groupWord(input.person) : 'everyone';
      if (input.before ?? input.lead) out.lead = parseLead(input.before ?? input.lead);
      if (input.at ?? input.time) out.at = parseClock(input.at ?? input.time);
      if (/^(true|yes|si|sí|1)$/i.test(String(input.calendar ?? ''))) out.calendar = true;
      break;
    case 'digest':
      if (input.every ?? input.frequency) out.every = parseEvery(input.every ?? input.frequency);
      if (input.at ?? input.time) out.at = parseClock(input.at ?? input.time);
      break;
    default:
  }
  return out;
}
