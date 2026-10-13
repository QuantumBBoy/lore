// Short phrases for briefs and summaries. Kin answers in the user's language; these give the
// on-device model ready-made lines in English or Spanish so it does not have to translate.

const plural = (n, one, many) => (n === 1 ? one : many);

const en = {
  birthdayToday: (years) => `Birthday today${years ? ` (turns ${years})` : ''}!`,
  birthdayIn: (days, date, years) => `Birthday in ${days} ${plural(days, 'day', 'days')} (${date}${years ? `, turns ${years}` : ''})`,
  dateToday: (label, years) => `${label} today${years ? ` (${years} ${plural(years, 'year', 'years')})` : ''}`,
  dateIn: (label, days, date, years) => `${label} in ${days} ${plural(days, 'day', 'days')} (${date}${years ? `, ${years} ${plural(years, 'year', 'years')}` : ''})`,
  ask: (text, due) => `Follow-up: ${text}${due ? ` (by ${due})` : ''}`,
  promised: (text) => `Promise: ${text}`,
  lent: (text) => `Lent (not returned): ${text}`,
  borrowed: (text) => `Borrowed (to return): ${text}`,
  lastNote: (date, text) => `Last note (${date}): ${text}`,
  contactToday: () => 'In touch today',
  lastContact: (days) => `Last contact ${days} ${plural(days, 'day', 'days')} ago`,
  overdue: (days, over) => `Last contact ${days} days ago, ${over} ${plural(over, 'day', 'days')} past your usual`,
  noContact: () => 'No contact recorded yet',
  nothing: (name) => `Nothing pending with ${name}.`,
  withheld: (n) => `${n} sensitive ${plural(n, 'item', 'items')} hidden: ask to see ${plural(n, 'it', 'them')}.`,
};

const es = {
  birthdayToday: (years) => `¡Hoy es su cumpleaños${years ? ` (cumple ${years})` : ''}!`,
  birthdayIn: (days, date, years) => `Cumpleaños en ${days} ${plural(days, 'día', 'días')} (${date}${years ? `, cumple ${years}` : ''})`,
  dateToday: (label, years) => `${label}: hoy${years ? ` (${years} ${plural(years, 'año', 'años')})` : ''}`,
  dateIn: (label, days, date, years) => `${label} en ${days} ${plural(days, 'día', 'días')} (${date}${years ? `, ${years} ${plural(years, 'año', 'años')}` : ''})`,
  ask: (text, due) => `Pendiente: ${text}${due ? ` (antes del ${due})` : ''}`,
  promised: (text) => `Promesa: ${text}`,
  lent: (text) => `Prestado (sin devolver): ${text}`,
  borrowed: (text) => `Te prestó (por devolver): ${text}`,
  lastNote: (date, text) => `Última nota (${date}): ${text}`,
  contactToday: () => 'Habéis hablado hoy',
  lastContact: (days) => `Último contacto hace ${days} ${plural(days, 'día', 'días')}`,
  overdue: (days, over) => `Último contacto hace ${days} días, ${over} ${plural(over, 'día', 'días')} más de lo habitual`,
  noContact: () => 'Sin contacto registrado',
  nothing: (name) => `Nada pendiente con ${name}.`,
  withheld: (n) => `${n} ${plural(n, 'dato sensible oculto', 'datos sensibles ocultos')}: pídelo si quieres ${plural(n, 'verlo', 'verlos')}.`,
};

const CATALOGS = { en, es };

/** Phrases for a language tag such as "es" or "en-GB"; English when unknown. */
export function phrases(language = 'en') {
  const lang = String(language || 'en').toLowerCase().split('-')[0];
  return CATALOGS[lang] ?? en;
}

export const SUPPORTED_LANGUAGES = Object.keys(CATALOGS);
