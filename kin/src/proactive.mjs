// Kin speaking first: a short summary to open from a notification (digest), reminders before
// dates handed to the app's notification scheduler (remind), and dates exported to a calendar
// (remind with calendar). Kin works out every date and time from the device clock (spec 15.1) and
// returns finished parameters for the app's schedule_notification intent, one line each:
//   run_intent schedule_notification {"title":…,"message":…,"hour":9,"minute":0,"year":…}
// The model only copies them into run_intent. Results end with a sentence the owner can say if
// the model did not (docs/research/builtin-skills.md).

import { addDays, daysBetween, formatIso, formatShortDate } from '../../lore-core/src/dates.mjs';
import { overdue as overdueQuery, upcoming as upcomingQuery } from '../../lore-core/src/queries.mjs';
import { isVisible } from '../../lore-core/src/sensitivity.mjs';
import { truncate } from '../../lore-core/src/text.mjs';
import { calendarDates } from './calendar.mjs';
import { cleanText, reply, resolvePerson, showDate } from './shared.mjs';
import { DEFAULT_TIME, GROUPS, WEEKDAYS, clockParts, digestSetting, groupOf, groupWord, leadDays, leadFor, parseClock, parseEvery, parseLead, remindAt } from './settings.mjs';
import { needsNudge } from './store.mjs';

export const MAX_REMINDERS = 3;
export const DIGEST_DAYS = 14;
export const CALENDAR_ASPECT_RATIO = 1.2;

const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const toMinutes = (clock) => clockParts(clock).hour * 60 + clockParts(clock).minute;

/** The device's local date and minute of the day (spec 15.1: the clock, never the model). */
export function localClock(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const get = (type) => Number(parts.find((p) => p.type === type).value);
    return { date: formatIso(get('year'), get('month'), get('day')), minutes: (get('hour') % 24) * 60 + get('minute') };
  } catch {
    return { date: now.toISOString().slice(0, 10), minutes: now.getUTCHours() * 60 + now.getUTCMinutes() };
  }
}

/** Parameters for the app's schedule_notification intent (one-shot on a date, or daily). */
export function notificationParams({ title, message, date = null, at, daily = false }) {
  const { hour, minute } = clockParts(at);
  const params = { title, message, hour, minute };
  if (daily) params.repeat_daily = true;
  else Object.assign(params, { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)) });
  return params;
}

/** The line the model copies into run_intent. */
export const intentLine = (params) => `run_intent schedule_notification ${JSON.stringify(params)}`;

const weekdayIndex = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Next time the weekday comes at that time, strictly after now. */
function nextWeekly(day, at, clock) {
  const ahead = (WEEKDAYS.indexOf(day) - weekdayIndex(clock.date) + 7) % 7;
  const date = addDays(clock.date, ahead === 0 && toMinutes(at) <= clock.minutes ? 7 : ahead);
  return date;
}

// ------------------------------------------------------------------------------------- digest

function digestLines(ctx) {
  const { t, folder, today } = ctx;
  const opts = { today, includeSensitive: false }; // a summary is meant to be shown: never sensitive
  const lines = [];
  const more = (n) => (n > 0 ? ` ${t.andMore(n)}` : '');

  const soon = upcomingQuery(folder, { ...opts, days: DIGEST_DAYS }).items;
  if (soon.length) {
    const items = soon.slice(0, 3).map((i) => t.digestDate(i.name, i.kind === 'birthday' ? t.birthdayWord : i.label || i.kind, t.inDays(i.daysAway)));
    lines.push(t.digestDates(items) + more(soon.length - 3));
  }

  const late = overdueQuery(folder, opts).overdue;
  if (late.length) lines.push(t.digestOverdue(late.slice(0, 3).map((p) => t.digestOverdueItem(p.name, p.daysSince))) + more(late.length - 3));

  const promises = [];
  for (const slug of folder.slugs()) {
    let name;
    try {
      name = folder.nameOf(slug);
    } catch {
      continue;
    }
    if (!name) continue;
    for (const e of folder.entries(slug, 'promises')) {
      if (e.checked === true || e.attrs.status === 'cancelled' || !isVisible(e.level)) continue;
      promises.push({ name, text: e.text, due: e.attrs.due ?? '9999', date: e.date ?? '' });
    }
  }
  promises.sort((a, b) => a.due.localeCompare(b.due) || a.date.localeCompare(b.date));
  if (promises.length) lines.push(t.digestPromises(promises.slice(0, 3).map((p) => `${p.name}: ${truncate(p.text, 40)}`)) + more(promises.length - 3));

  const everyDays = Number(folder.setting('kin.export_every_days')) || 30;
  const everyChanges = Number(folder.setting('kin.export_every_changes')) || 20;
  if (needsNudge(ctx.meta, today, { everyDays, everyChanges })) {
    lines.push(t.digestBackup(ctx.meta.changesSinceExport));
    ctx.meta.lastNudge = today; // said here, so not again as a tip
  }

  if (!lines.length) return [t.digestNothing];
  return [t.digestTitle(formatShortDate(today, ctx.lang)), ...lines];
}

function scheduleDigest(ctx, everyRaw, atRaw) {
  const { t, folder } = ctx;
  const current = digestSetting(folder);
  const every = everyRaw ? parseEvery(everyRaw) : current?.every ?? 'day';
  if (!every) return reply(t.badEvery(everyRaw));
  if (!folder.writable) return reply(t.unsupportedVersion(folder.version));
  if (every === 'off') {
    folder.updateMe({ 'kin.digest': null });
    ctx.schedule.digestNext = null;
    ctx.scheduleChanged = true;
    return reply(t.digestOff);
  }
  const at = atRaw ? parseClock(atRaw) : current?.at ?? DEFAULT_TIME;
  if (!at) return reply(t.badClock(atRaw));
  folder.updateMe({ 'kin.digest': { every, at } });

  const { title, message } = t.digestNotification;
  const lines = [t.digestSet(every, at)];
  let params;
  if (every === 'day') {
    params = notificationParams({ title, message, at, daily: true });
    ctx.schedule.digestNext = null;
    lines.push(intentLine(params), t.fallbackPrefix + t.fallbackDaily(params));
  } else {
    const date = nextWeekly(every, at, ctx.clock);
    params = notificationParams({ title, message, date, at });
    ctx.schedule.digestNext = `${date}T${at}`;
    lines.push(intentLine(params), t.digestWeekly, t.fallbackPrefix + t.fallbackOne(params));
  }
  ctx.scheduleChanged = true;
  return reply(lines.join('\n'));
}

/**
 * digest: the summary now, or with every/at, set up a notification that opens it. The app can
 * only repeat daily, so a weekly summary is a one-shot notification that each summary renews.
 */
export function digest(ctx, input) {
  const every = cleanText(input.every ?? input.frequency ?? input.repeat);
  const at = cleanText(input.at ?? input.time);
  if (every || at) return scheduleDigest(ctx, every, at);

  const lines = digestLines(ctx);
  const setting = digestSetting(ctx.folder);
  const now = `${ctx.clock.date}T${hhmm(ctx.clock.minutes)}`;
  if (setting && setting.every !== 'day' && (!ctx.schedule.digestNext || ctx.schedule.digestNext <= now)) {
    const date = nextWeekly(setting.every, setting.at, ctx.clock);
    const params = notificationParams({ ...ctx.t.digestNotification, date, at: setting.at });
    ctx.schedule.digestNext = `${date}T${setting.at}`;
    ctx.scheduleChanged = true;
    lines.push(intentLine(params), ctx.t.fallbackPrefix + ctx.t.fallbackOne(params));
  }
  return reply(lines.join('\n'));
}

// ------------------------------------------------------------------------------------- remind

/**
 * When to remind the owner of an occurrence (spec 15.6): `lead` days before at `at`, or, when that
 * has passed, the next `at` that is not after the occurrence. Null when it is too late.
 */
export function reminderSlot(occurrence, lead, at, clock) {
  const atMin = toMinutes(at);
  const target = addDays(occurrence, -lead);
  if (target > clock.date || (target === clock.date && atMin > clock.minutes)) return { date: target, late: false };
  const next = atMin > clock.minutes ? clock.date : addDays(clock.date, 1);
  return next <= occurrence ? { date: next, late: true } : null;
}

/** Plan the reminders for some people: every visible date in the next year. */
export function planReminders(folder, slugs, clock, { at = remindAt(folder) } = {}) {
  const wanted = new Set(slugs);
  const all = upcomingQuery(folder, { today: clock.date, days: 366, includeSensitive: false });
  const withSensitive = upcomingQuery(folder, { today: clock.date, days: 366, includeSensitive: true });
  const sensitive = withSensitive.items.filter((i) => wanted.has(i.slug)).length - all.items.filter((i) => wanted.has(i.slug)).length;
  const plans = [];
  const tooLate = [];
  for (const item of all.items) {
    if (!wanted.has(item.slug)) continue;
    const lead = leadFor(folder, item.slug);
    const slot = reminderSlot(item.date, lead, at, clock);
    if (!slot) {
      tooLate.push(item);
      continue;
    }
    const key = item.kind === 'birthday' ? 'birthday' : item.label;
    plans.push({ ...item, lead, at, slot, id: `${item.slug}|${key}|${item.date}|${slot.date}T${at}` });
  }
  plans.sort((a, b) => a.slot.date.localeCompare(b.slot.date) || a.name.localeCompare(b.name));
  return { plans, tooLate, sensitive };
}

// Labels are cut so three reminders stay short enough for a small model's context.
const whatOf = (t, item) => (item.kind === 'birthday' ? t.birthdayWord : truncate(item.label || item.kind, 30));

function reminderNotification(ctx, plan) {
  const { t } = ctx;
  const what = whatOf(t, plan);
  const on = formatShortDate(plan.date, ctx.lang);
  const days = daysBetween(plan.slot.date, plan.date);
  const title = t.notifTitle(plan.name, what, days);
  const message = plan.kind === 'birthday' ? t.notifBirthday(plan.name, on) : t.notifOther(plan.name, what, on);
  return notificationParams({ title, message, date: plan.slot.date, at: plan.at });
}

function setLead(ctx, before, scope) {
  const { t, folder } = ctx;
  const lead = parseLead(before);
  if (lead === null) return { reply: reply(t.badLead(before)) };
  if (!folder.writable) return { reply: reply(t.unsupportedVersion(folder.version)) };
  if (scope.slug) {
    folder.updatePerson(scope.slug, { 'kin.lead_days': lead });
    return { line: t.leadSet(scope.name, t.leadText(lead)) };
  }
  const current = leadDays(folder);
  const next = scope.group === 'everyone' ? Object.fromEntries(GROUPS.map((g) => [g, lead])) : { ...current, [scope.group]: lead };
  folder.updateMe({ 'kin.lead_days': next });
  return { line: t.leadSet(t.groupName[scope.group], t.leadText(lead)) };
}

function calendarExport(ctx) {
  const { t } = ctx;
  const { dates, withheld } = calendarDates(ctx.folder, { today: ctx.today });
  if (!dates.length) return reply(t.calendarEmpty);
  const pending = dates.filter((d) => !d.exported).length;
  const lines = [pending ? t.calendarPending(pending, dates.length - pending) : t.calendarNothing(dates.length)];
  if (withheld) lines.push(t.calendarSensitive(withheld));
  return reply(lines.join('\n'), { webview: { url: `calendar.html?lang=${ctx.lang}`, aspectRatio: CALENDAR_ASPECT_RATIO } });
}

/**
 * remind: plan reminders for a person or a group (partner, family, friends, colleagues,
 * everyone), optionally changing how long before ("before") and at what time ("at"). With
 * calendar, export the dates to a calendar instead.
 */
export function remind(ctx, input) {
  const { t, folder } = ctx;
  if (input.calendar === true || /^(true|yes|si|sí|1)$/i.test(String(input.calendar ?? ''))) return calendarExport(ctx);

  const raw = cleanText(input.person ?? input.group);
  const group = raw ? groupWord(raw) : 'everyone';
  let scope;
  let slugs;
  if (group) {
    const relationshipOf = (slug) => {
      try {
        return folder.person(slug).data.relationship;
      } catch {
        return null;
      }
    };
    slugs = folder.slugs().filter((s) => group === 'everyone' || groupOf(relationshipOf(s)) === group);
    scope = { group, label: t.scopeGroup[group] };
  } else {
    // Changing their lead time writes to their file, so a near spelling is a question then.
    const who = resolvePerson(ctx, raw, { write: Boolean(cleanText(input.before ?? input.lead)) });
    if (who.reply) return reply(who.reply);
    slugs = [who.slug];
    scope = { slug: who.slug, name: who.name, label: t.scopePerson(who.name) };
  }

  const lines = [];
  const before = cleanText(input.before ?? input.lead);
  if (before) {
    const set = setLead(ctx, before, scope);
    if (set.reply) return set.reply;
    lines.push(set.line);
  }
  // A time for one person is for this request; for a group or everyone it becomes the setting.
  const atRaw = cleanText(input.at ?? input.time);
  let at;
  if (atRaw) {
    at = parseClock(atRaw);
    if (!at) return reply(t.badClock(atRaw));
    if (!scope.slug) {
      if (!folder.writable) return reply(t.unsupportedVersion(folder.version));
      folder.updateMe({ 'kin.remind_at': at });
    }
  }

  const { plans, tooLate, sensitive } = planReminders(folder, slugs, ctx.clock, at ? { at } : {});
  const done = ctx.schedule.reminders;
  const fresh = plans.filter((p) => !done[p.id]);
  const already = plans.filter((p) => done[p.id]);
  const describe = (p) => `${p.name} (${showDate(p.slot.date, ctx)} ${p.at})`;
  const tail = [];
  if (tooLate.length) tail.push(t.remindTooLate(tooLate.map((i) => `${i.name}, ${whatOf(t, i)} ${t.inDays(i.daysAway)}`)));
  if (sensitive > 0) tail.push(t.remindSensitive(sensitive));

  if (!plans.length) return reply([...lines, t.remindNone(scope.label), ...tail].join('\n'));
  if (!fresh.length && !ctx.confirm) return reply([...lines, t.remindAlready(already.slice(0, MAX_REMINDERS).map(describe)), ...tail].join('\n'));

  const pool = fresh.length ? fresh : already;
  const chosen = pool.slice(0, MAX_REMINDERS);
  lines.push(t.remindTitle);
  for (const p of chosen) {
    const what = whatOf(t, p);
    lines.push(t.remindLine(p.name, what, showDate(p.date, ctx), `${showDate(p.slot.date, ctx)}, ${p.at}`, p.slot.late));
  }
  const params = chosen.map((p) => reminderNotification(ctx, p));
  lines.push(...params.map(intentLine));
  if (pool.length > chosen.length) lines.push(t.remindMore(pool.length - chosen.length));
  lines.push(...tail);
  lines.push(t.fallbackPrefix + (params.length === 1 ? t.fallbackOne(params[0]) : t.fallbackMany));
  for (const p of chosen) done[p.id] = ctx.today;
  ctx.scheduleChanged = true;
  return reply(lines.join('\n'));
}
