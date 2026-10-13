// Questions Kin asks of a Lore folder (spec section 15). Every function filters sensitive data in
// code (spec 6.4) unless the caller passes includeSensitive: true for an explicit request, and
// reports how many items it withheld. "Today" always comes from the runtime clock (dates.today).

import { addCadence, daysBetween, formatShortDate, isCadence, nextOccurrence, parsePersonDate, today as runtimeToday } from './dates.mjs';
import { phrases } from './i18n.mjs';
import { entryLevel, fieldLevel, isVisible, itemLevel } from './sensitivity.mjs';
import { normalizeText, truncate } from './text.mjs';

const pathOf = (slug) => `people/${slug}.md`;

function eachPerson(folder, fn) {
  for (const slug of folder.slugs()) {
    let file;
    try {
      file = folder.person(slug);
    } catch {
      continue; // unreadable files are reported by validate()
    }
    fn(slug, file, file.data);
  }
}

/** Entries of a section with their effective level. */
function sectionEntries(file, id) {
  return file.body.sections
    .filter((s) => s.id === id)
    .flatMap((s) => s.entries.map((e) => ({ entry: e, level: entryLevel(file.data, s, e, file.path) })));
}

/**
 * Birthdays and other dates in the next `days` days (inclusive of today).
 * @returns {{today, days, items: {slug, name, kind, label, date, daysAway, years}[], withheld}}
 */
export function upcoming(folder, { today = runtimeToday(), days = 30, includeSensitive = false } = {}) {
  const opts = { includeSensitive };
  const items = [];
  let withheld = 0;
  eachPerson(folder, (slug, file, data) => {
    const path = pathOf(slug);
    const nameOk = isVisible(fieldLevel(data, 'name', path), opts) && typeof data.name === 'string';
    const consider = (dateStr, kind, label, recurring, level) => {
      const occ = nextOccurrence(dateStr, today, { recurring, leapDay: folder.leapDay });
      if (!occ) return;
      const daysAway = daysBetween(today, occ.date);
      if (daysAway > days) return;
      if (!nameOk || !isVisible(level, opts)) {
        withheld++;
        return;
      }
      items.push({ slug, name: data.name, kind, label, date: occ.date, daysAway, years: occ.years });
    };
    if (typeof data.birthday === 'string') consider(data.birthday, 'birthday', 'Birthday', true, fieldLevel(data, 'birthday', path));
    for (const d of Array.isArray(data.dates) ? data.dates : []) {
      if (!d || typeof d.date !== 'string') continue;
      consider(d.date, d.kind ?? 'other', d.label ?? '', d.recurring !== false, itemLevel(data, 'dates', d, path));
    }
  });
  items.sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name));
  return { today, days, items, withheld };
}

/**
 * People the owner has not been in touch with as often as they want (spec 15.3).
 * @returns {{today, overdue: object[], noContact: object[], withheld}}
 */
export function overdue(folder, { today = runtimeToday(), includeSensitive = false } = {}) {
  const opts = { includeSensitive };
  const late = [];
  const noContact = [];
  let withheld = 0;
  eachPerson(folder, (slug, file, data) => {
    const path = pathOf(slug);
    if (!isCadence(data.contact_cadence)) return;
    const levels = ['name', 'contact_cadence', 'last_contact'].map((f) => fieldLevel(data, f, path));
    if (!levels.every((l) => isVisible(l, opts))) {
      withheld++;
      return;
    }
    const last = data.last_contact;
    if (!parsePersonDate(last)?.year) {
      noContact.push({ slug, name: data.name, cadence: data.contact_cadence });
      return;
    }
    const due = addCadence(last, data.contact_cadence);
    if (today > due) {
      late.push({
        slug,
        name: data.name,
        cadence: data.contact_cadence,
        lastContact: last,
        due,
        daysSince: daysBetween(last, today),
        daysOverdue: daysBetween(due, today),
      });
    }
  });
  late.sort((a, b) => b.daysOverdue - a.daysOverdue || a.name.localeCompare(b.name));
  noContact.sort((a, b) => a.name.localeCompare(b.name));
  return { today, overdue: late, noContact, withheld };
}

const words = (s) => ` ${normalizeText(s)} `;

/** Is `a` the same gift as `b`: equal, or one contains the other as whole words (spec 15.4)? */
export function sameGift(a, b) {
  const x = words(a);
  const y = words(b);
  if (x.trim().length < 3 || y.trim().length < 3) return x === y;
  return x === y || x.includes(y) || y.includes(x);
}

/** Gifts given and pending ideas, with likely repeats. */
export function giftHistory(folder, slug, { includeSensitive = false } = {}) {
  const file = folder.requirePerson(slug);
  const opts = { includeSensitive };
  let withheld = 0;
  const visible = (rows) =>
    rows.filter(({ level }) => {
      if (isVisible(level, opts)) return true;
      withheld++;
      return false;
    });
  const given = visible(sectionEntries(file, 'gifts-given')).map(({ entry }) => ({
    date: entry.date,
    text: entry.text,
    occasion: entry.attrs.occasion ?? null,
    price: entry.attrs.price ?? null,
  }));
  given.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  const ideas = visible(sectionEntries(file, 'gift-ideas')).map(({ entry }) => ({
    date: entry.date,
    text: entry.text,
    occasion: entry.attrs.occasion ?? null,
    price: entry.attrs.price ?? null,
    repeatOf: null,
  }));
  for (const idea of ideas) {
    const match = given.find((g) => sameGift(idea.text, g.text));
    if (match) idea.repeatOf = match;
  }
  return { given, ideas, withheld };
}

/** Gifts already given that look like `text`. */
export function findGiven(folder, slug, text, options) {
  return giftHistory(folder, slug, options).given.filter((g) => sameGift(text, g.text));
}

/**
 * What a model needs to suggest a gift, and nothing more: tastes, diet, sizes, pending ideas,
 * recent gifts (to avoid repeats), an optional budget and the next occasion.
 */
export function giftContext(folder, slug, { today = runtimeToday(), includeSensitive = false, budget = null, maxGiven = 8 } = {}) {
  const file = folder.requirePerson(slug);
  const data = file.data;
  const opts = { includeSensitive };
  let withheld = 0;
  const texts = (id) =>
    sectionEntries(file, id)
      .filter(({ level }) => {
        if (isVisible(level, opts)) return true;
        withheld++;
        return false;
      })
      .map(({ entry }) => truncate(entry.text, 120));
  const history = giftHistory(folder, slug, opts);
  withheld += history.withheld;
  const next = upcoming(folder, { today, days: 366, includeSensitive }).items.find((i) => i.slug === slug) ?? null;
  return {
    name: data.name,
    relationship: isVisible(fieldLevel(data, 'relationship', file.path), opts) ? data.relationship ?? null : null,
    likes: texts('likes'),
    diet: texts('diet'),
    sizes: texts('sizes'),
    ideas: history.ideas,
    given: history.given.slice(0, maxGiven),
    budget: budget ?? null,
    nextOccasion: next ? { label: next.label, date: next.date, daysAway: next.daysAway, years: next.years } : null,
    withheld,
  };
}

/**
 * A pre-meeting brief: at most `maxLines` short lines (3 to 5 is the goal) about nearby dates,
 * open follow-ups and promises, the latest note and how long since the last contact.
 */
export function brief(folder, slug, { today = runtimeToday(), includeSensitive = false, maxLines = 5, language } = {}) {
  const file = folder.requirePerson(slug);
  const data = file.data;
  const path = file.path;
  const opts = { includeSensitive };
  const t = phrases(language ?? folder.language);
  const lang = language ?? folder.language;
  let withheld = 0;
  const lines = [];

  const next = upcoming(folder, { today, days: 30, includeSensitive }).items.filter((i) => i.slug === slug)[0];
  if (next) {
    const date = formatShortDate(next.date, lang);
    if (next.kind === 'birthday') lines.push(next.daysAway === 0 ? t.birthdayToday(next.years) : t.birthdayIn(next.daysAway, date, next.years));
    else lines.push(next.daysAway === 0 ? t.dateToday(next.label, next.years) : t.dateIn(next.label, next.daysAway, date, next.years));
  }

  const open = (id) =>
    sectionEntries(file, id).filter(({ entry, level }) => {
      if (entry.checked !== false || entry.attrs.status === 'cancelled') return false;
      if (isVisible(level, opts)) return true;
      withheld++;
      return false;
    });

  const followUps = open('follow-ups').sort(
    (a, b) => String(a.entry.attrs.due ?? '9999').localeCompare(String(b.entry.attrs.due ?? '9999')) || String(a.entry.date ?? '').localeCompare(String(b.entry.date ?? '')),
  );
  for (const { entry } of followUps.slice(0, 2)) {
    lines.push(t.ask(truncate(entry.text, 90), entry.attrs.due ? formatShortDate(entry.attrs.due, lang) : null));
  }
  for (const { entry } of open('promises').slice(0, 2)) {
    const say = { lent: t.lent, borrowed: t.borrowed }[entry.attrs.type] ?? t.promised;
    lines.push(say(truncate(entry.text, 90)));
  }

  const notes = sectionEntries(file, 'notes')
    .filter(({ entry }) => entry.date)
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date));
  const latest = notes.find(({ level }) => isVisible(level, opts));
  if (notes.length && notes[0] !== latest) withheld++;
  if (latest) lines.push(t.lastNote(latest.entry.date.length === 10 ? formatShortDate(latest.entry.date, lang) : latest.entry.date, truncate(latest.entry.text, 100)));

  if (isVisible(fieldLevel(data, 'last_contact', path), opts) && parsePersonDate(data.last_contact)?.year) {
    const since = daysBetween(data.last_contact, today);
    let line = since <= 0 ? t.contactToday() : t.lastContact(since);
    if (isCadence(data.contact_cadence) && isVisible(fieldLevel(data, 'contact_cadence', path), opts)) {
      const due = addCadence(data.last_contact, data.contact_cadence);
      if (today > due) line = t.overdue(since, daysBetween(due, today));
    }
    lines.push(line);
  } else if (isCadence(data.contact_cadence)) {
    lines.push(t.noContact());
  }

  const name = isVisible(fieldLevel(data, 'name', path), opts) ? data.name : slug;
  const out = lines.slice(0, maxLines);
  return { name, lines: out.length ? out : [t.nothing(name)], withheld, withheldLine: withheld ? t.withheld(withheld) : null };
}

/** Facts about one person for a short answer: who they are, dates, contact, open items. */
export function personSummary(folder, slug, { today = runtimeToday(), includeSensitive = false } = {}) {
  const file = folder.requirePerson(slug);
  const data = file.data;
  const path = file.path;
  const opts = { includeSensitive };
  let withheld = 0;
  const field = (f) => {
    if (data[f] === undefined) return null;
    if (isVisible(fieldLevel(data, f, path), opts)) return data[f];
    withheld++;
    return null;
  };
  const count = (id, pred = () => true) =>
    sectionEntries(file, id).filter(({ entry, level }) => {
      if (!pred(entry)) return false;
      if (isVisible(level, opts)) return true;
      withheld++;
      return false;
    }).length;
  const birthday = field('birthday');
  const next = birthday ? nextOccurrence(birthday, today, { leapDay: folder.leapDay }) : null;
  const links = (Array.isArray(data.links) ? data.links : [])
    .filter((l) => l && isVisible(itemLevel(data, 'links', l, path), opts))
    .map((l) => ({ slug: l.person, name: folder.nameOf(l.person, opts) ?? l.person, type: l.type }));
  const lastContact = field('last_contact');
  const cadence = field('contact_cadence');
  const due = lastContact && isCadence(cadence) && parsePersonDate(lastContact)?.year ? addCadence(lastContact, cadence) : null;
  return {
    slug,
    name: field('name') ?? slug,
    aliases: field('aliases') ?? [],
    pronouns: field('pronouns'),
    relationship: field('relationship'),
    birthday: birthday ? { date: birthday, next: next?.date ?? null, daysAway: next ? daysBetween(today, next.date) : null, years: next?.years ?? null } : null,
    lastContact,
    cadence,
    daysSinceContact: lastContact && parsePersonDate(lastContact)?.year ? daysBetween(lastContact, today) : null,
    overdueBy: due && today > due ? daysBetween(due, today) : 0,
    links,
    counts: {
      giftIdeas: count('gift-ideas'),
      openFollowUps: count('follow-ups', (e) => e.checked === false && e.attrs.status !== 'cancelled'),
      openPromises: count('promises', (e) => e.checked === false && e.attrs.status !== 'cancelled'),
      notes: count('notes'),
    },
    withheld,
  };
}
