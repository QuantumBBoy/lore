// Everything Kin says, in English and Spanish. Results are short so a small model can repeat them.

const plural = (n, one, many) => (n === 1 ? one : many);
const list = (items, word) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${word} ${items.at(-1)}`);

const SECTIONS = {
  en: { likes: 'tastes', sizes: 'sizes', diet: 'diet', 'gift-ideas': 'gift ideas', 'gifts-given': 'gifts given', 'plan-ideas': 'plans', 'follow-ups': 'to ask', promises: 'promises', notes: 'notes' },
  es: { likes: 'gustos', sizes: 'tallas', diet: 'alimentación', 'gift-ideas': 'ideas de regalo', 'gifts-given': 'regalos hechos', 'plan-ideas': 'planes', 'follow-ups': 'pendiente de preguntar', promises: 'promesas', notes: 'notas' },
};

const FIELDS = {
  en: { name: 'name', alias: 'nickname', relationship: 'relationship', birthday: 'birthday', pronouns: 'pronouns', cadence: 'how often to keep in touch', last_contact: 'last contact' },
  es: { name: 'nombre', alias: 'apodo', relationship: 'relación', birthday: 'cumpleaños', pronouns: 'pronombres', cadence: 'cada cuánto hablar', last_contact: 'último contacto' },
};

const LINKS = {
  en: {},
  es: {
    partner: 'pareja', spouse: 'cónyuge', 'ex-partner': 'expareja', parent: 'madre/padre', child: 'hija/hijo',
    sibling: 'hermana/hermano', grandparent: 'abuela/abuelo', grandchild: 'nieta/nieto', 'aunt-uncle': 'tía/tío',
    'niece-nephew': 'sobrina/sobrino', cousin: 'prima/primo', 'in-law': 'familia política', friend: 'amistad',
    colleague: 'compañero/a de trabajo', manager: 'jefa/jefe', report: 'persona a su cargo', neighbor: 'vecina/vecino',
  },
};

const UNITS = {
  en: { d: ['day', 'days'], w: ['week', 'weeks'], m: ['month', 'months'], y: ['year', 'years'] },
  es: { d: ['día', 'días'], w: ['semana', 'semanas'], m: ['mes', 'meses'], y: ['año', 'años'] },
};

const en = {
  section: (id) => SECTIONS.en[id] ?? id,
  field: (f) => FIELDS.en[f] ?? f,
  linkType: (t) => LINKS.en[t] ?? t,
  cadence: (c) => {
    const n = Number(c.slice(0, -1));
    return `${n === 1 ? '' : `${n} `}${plural(n, ...UNITS.en[c.at(-1)])}`;
  },
  // capture
  saved: (name, section, text) => `Saved for ${name} (${section}): ${text}`,
  markedSensitive: ' (marked sensitive)',
  alreadyGiven: (text, date) => ` Careful: you already gave "${text}"${date ? ` (${date})` : ''}.`,
  movedFromIdeas: ' Removed it from gift ideas.',
  savedBirthday: (name, date) => `Saved ${name}'s birthday: ${date}.`,
  savedDate: (name, label, date) => `Saved for ${name}: ${label}, ${date}.`,
  added: (name) => `Added ${name}. `,
  // people
  notFound: (q, suggestions) => `I don't know anyone called "${q}".${suggestions.length ? ` Did you mean ${list(suggestions, 'or')}?` : ''} Should I add "${q}" as a new person?`,
  ambiguous: (q, names) => `Who do you mean by "${q}": ${list(names, 'or')}?`,
  // person
  birthdayLine: (date, days, years) => `Birthday: ${date}${days === 0 ? ', today!' : days !== null ? ` (in ${days} ${plural(days, 'day', 'days')}${years ? `, turns ${years}` : ''})` : ''}`,
  contactLine: (days, overdue) => `Last contact: ${days === 0 ? 'today' : `${days} ${plural(days, 'day', 'days')} ago`}${overdue ? `, ${overdue} ${plural(overdue, 'day', 'days')} later than you wanted` : ''}`,
  openLine: (parts) => `Open: ${parts.join(', ')}`,
  openToAsk: (n) => `${n} to ask`,
  openPromises: (n) => `${n} ${plural(n, 'promise', 'promises')}`,
  openIdeas: (n) => `${n} gift ${plural(n, 'idea', 'ideas')}`,
  links: (items) => `People: ${items.join('; ')}`,
  // brief
  briefTitle: (name) => `Before you see ${name}:`,
  // lists
  inDays: (days) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`),
  upcomingBirthday: (name, when, date, years) => `${name}: birthday ${when} (${date}${years ? `, turns ${years}` : ''})`,
  upcomingDate: (name, label, when, date, years) => `${name}: ${label} ${when} (${date}${years ? `, ${years} ${plural(years, 'year', 'years')}` : ''})`,
  nothingUpcoming: (days) => `Nothing in the next ${days} days.`,
  overdueLine: (name, days, cadence) => `${name}: ${days} days since you last talked (you wanted every ${cadence})`,
  noContactLine: (names) => `No contact recorded yet: ${names.join(', ')}`,
  allCaughtUp: () => "You're up to date with everyone.",
  more: (n) => `…and ${n} more.`,
  // gift context
  giftTitle: (name, relationship) => `Gift context for ${name}${relationship ? ` (${relationship})` : ''}.`,
  budget: (b) => `Budget: ${b}.`,
  likes: (x) => `Likes: ${x}`,
  diet: (x) => `Diet: ${x}`,
  sizes: (x) => `Sizes: ${x}`,
  ideas: (x) => `Saved ideas: ${x}`,
  given: (x) => `Already given, do not repeat: ${x}`,
  nextOccasion: (label, days) => `Next occasion: ${label.toLowerCase()} ${days === 0 ? 'today' : `in ${days} days`}.`,
  noGiftInfo: (name) => `I know little about ${name}'s tastes yet.`,
  // done
  done: (text) => `Done: ${text}`,
  given_: (text) => `Moved to gifts given: ${text}`,
  noOpenMatch: (name, q, open) => `Nothing open for ${name} matches "${q}".${open.length ? ` Open: ${open.join('; ')}` : ` ${name} has nothing open.`}`,
  whichOne: (items) => `Several match: ${items.join('; ')}. Which one?`,
  // update
  updated: (name, field, value) => `Updated ${name}: ${field} is now ${value}.`,
  removedField: (name, field) => `Removed ${field} from ${name}.`,
  aliasAdded: (name, alias) => `${name} can now also be called "${alias}".`,
  confirmChange: (name, field, old, value) => `${name}'s ${field} is ${old}. Change it to ${value}?`,
  confirmRemoveField: (name, field, old) => `Remove ${name}'s ${field} (${old})?`,
  unchanged: (name, field) => `${name}'s ${field} was already that.`,
  badValue: (field, value, hint) => `"${value}" is not a valid ${field}.${hint ? ` ${hint}` : ''}`,
  cadenceHint: 'Say it like "every 2 weeks" (2w), "every month" (1m) or "every 10 days" (10d).',
  dateHint: 'Use a date like 1990-04-12, "12 April" or "12 April 1990".',
  // link
  linked: (name, other, type) => `Linked: ${other} is ${name}'s ${type}.`,
  confirmRelink: (name, other, old, type) => `${other} is already ${name}'s ${old}. Change it to ${type}?`,
  sameLink: (name, other, type) => `${other} is already ${name}'s ${type}.`,
  // delete
  confirmDeletePerson: (name, n) => `Delete ${name} and everything about them (${n} ${plural(n, 'entry', 'entries')})? Only a backup can bring it back.`,
  confirmDeleteEntry: (name, text) => `Delete "${text}" from ${name}?`,
  deletedPerson: (name) => `Deleted ${name}.`,
  deletedEntry: (name, text) => `Deleted from ${name}: ${text}`,
  noEntryMatch: (name, q) => `Nothing about ${name} matches "${q}".`,
  // backup
  backup: (people, last) => `Backup panel below. ${people} ${plural(people, 'person', 'people')} saved; ${last ? `last backup ${last}` : 'no backup yet'}.`,
  nudge: 'Tip: it has been a while since your last backup. Say "backup" to save a copy.',
  // errors
  needPerson: 'Which person?',
  needText: 'What should I save?',
  needOther: 'Who is the other person?',
  needType: 'What is their relationship (for example partner, sibling, friend)?',
  needField: 'What should I change: name, nickname, relationship, birthday, pronouns, how often to keep in touch, or last contact?',
  badKind: (k, kinds) => `I don't know what kind of note "${k}" is. Use one of: ${kinds.join(', ')}.`,
  badDate: (d) => `I couldn't understand the date "${d}". Use a date like 2026-04-12, "yesterday" or "12 April".`,
  unknownAction: (a, actions) => `Unknown action "${a}". Use one of: ${actions.join(', ')}.`,
  storageFull: 'Kin has run out of space on this phone. Make a backup, then delete old notes.',
  failed: (msg) => `Kin could not do that: ${msg}`,
  noData: 'Kin has no data yet. Tell me something about someone to start.',
};

const es = {
  section: (id) => SECTIONS.es[id] ?? id,
  field: (f) => FIELDS.es[f] ?? f,
  linkType: (t) => LINKS.es[t] ?? t,
  cadence: (c) => {
    const n = Number(c.slice(0, -1));
    return `${n === 1 ? '' : `${n} `}${plural(n, ...UNITS.es[c.at(-1)])}`;
  },
  saved: (name, section, text) => `Guardado en ${name} (${section}): ${text}`,
  markedSensitive: ' (marcado como sensible)',
  alreadyGiven: (text, date) => ` Ojo: ya le regalaste "${text}"${date ? ` (${date})` : ''}.`,
  movedFromIdeas: ' Lo he quitado de ideas de regalo.',
  savedBirthday: (name, date) => `Guardado el cumpleaños de ${name}: ${date}.`,
  savedDate: (name, label, date) => `Guardado para ${name}: ${label}, ${date}.`,
  added: (name) => `He añadido a ${name}. `,
  notFound: (q, suggestions) => `No conozco a nadie llamado "${q}".${suggestions.length ? ` ¿Quizá ${list(suggestions, 'o')}?` : ''} ¿Añado a "${q}" como persona nueva?`,
  ambiguous: (q, names) => `¿A quién te refieres con "${q}": ${list(names, 'o')}?`,
  birthdayLine: (date, days, years) => `Cumpleaños: ${date}${days === 0 ? ', ¡hoy!' : days !== null ? ` (en ${days} ${plural(days, 'día', 'días')}${years ? `, cumple ${years}` : ''})` : ''}`,
  contactLine: (days, overdue) => `Último contacto: ${days === 0 ? 'hoy' : `hace ${days} ${plural(days, 'día', 'días')}`}${overdue ? `, ${overdue} ${plural(overdue, 'día', 'días')} más de lo que querías` : ''}`,
  openLine: (parts) => `Pendiente: ${parts.join(', ')}`,
  openToAsk: (n) => `${n} ${plural(n, 'pregunta', 'preguntas')}`,
  openPromises: (n) => `${n} ${plural(n, 'promesa', 'promesas')}`,
  openIdeas: (n) => `${n} ${plural(n, 'idea', 'ideas')} de regalo`,
  links: (items) => `Personas: ${items.join('; ')}`,
  briefTitle: (name) => `Antes de ver a ${name}:`,
  inDays: (days) => (days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`),
  upcomingBirthday: (name, when, date, years) => `${name}: cumpleaños ${when} (${date}${years ? `, cumple ${years}` : ''})`,
  upcomingDate: (name, label, when, date, years) => `${name}: ${label} ${when} (${date}${years ? `, ${years} ${plural(years, 'año', 'años')}` : ''})`,
  nothingUpcoming: (days) => `Nada en los próximos ${days} días.`,
  overdueLine: (name, days, cadence) => `${name}: hace ${days} días que no habláis (querías cada ${cadence})`,
  noContactLine: (names) => `Sin contacto registrado: ${names.join(', ')}`,
  allCaughtUp: () => 'Estás al día con todo el mundo.',
  more: (n) => `…y ${n} más.`,
  giftTitle: (name, relationship) => `Contexto de regalo para ${name}${relationship ? ` (${relationship})` : ''}.`,
  budget: (b) => `Presupuesto: ${b}.`,
  likes: (x) => `Le gusta: ${x}`,
  diet: (x) => `Alimentación: ${x}`,
  sizes: (x) => `Tallas: ${x}`,
  ideas: (x) => `Ideas guardadas: ${x}`,
  given: (x) => `Ya regalado, no repetir: ${x}`,
  nextOccasion: (label, days) => `Próxima ocasión: ${label.toLowerCase() === 'birthday' ? 'cumpleaños' : label.toLowerCase()} ${days === 0 ? 'hoy' : `en ${days} días`}.`,
  noGiftInfo: (name) => `Aún sé poco de los gustos de ${name}.`,
  done: (text) => `Hecho: ${text}`,
  given_: (text) => `Pasado a regalos hechos: ${text}`,
  noOpenMatch: (name, q, open) => `Nada pendiente de ${name} coincide con "${q}".${open.length ? ` Pendiente: ${open.join('; ')}` : ` ${name} no tiene nada pendiente.`}`,
  whichOne: (items) => `Coinciden varias: ${items.join('; ')}. ¿Cuál?`,
  updated: (name, field, value) => `Actualizado ${name}: ${field} ahora es ${value}.`,
  removedField: (name, field) => `He quitado ${field} de ${name}.`,
  aliasAdded: (name, alias) => `Ahora ${name} también se puede llamar "${alias}".`,
  confirmChange: (name, field, old, value) => `${field[0].toUpperCase()}${field.slice(1)} de ${name}: ${old}. ¿Lo cambio a ${value}?`,
  confirmRemoveField: (name, field, old) => `¿Quito ${field} de ${name} (${old})?`,
  unchanged: (name, field) => `${field[0].toUpperCase()}${field.slice(1)} de ${name} ya era eso.`,
  badValue: (field, value, hint) => `"${value}" no es válido para ${field}.${hint ? ` ${hint}` : ''}`,
  cadenceHint: 'Dilo como "cada 2 semanas" (2w), "cada mes" (1m) o "cada 10 días" (10d).',
  dateHint: 'Usa una fecha como 1990-04-12, "12 de abril" o "12 de abril de 1990".',
  linked: (name, other, type) => `Vinculado: ${other} es ${type} de ${name}.`,
  confirmRelink: (name, other, old, type) => `${other} ya es ${old} de ${name}. ¿Lo cambio a ${type}?`,
  sameLink: (name, other, type) => `${other} ya es ${type} de ${name}.`,
  confirmDeletePerson: (name, n) => `¿Borro a ${name} y todo lo que sé de esa persona (${n} ${plural(n, 'dato', 'datos')})? Solo una copia de seguridad podría recuperarlo.`,
  confirmDeleteEntry: (name, text) => `¿Borro "${text}" de ${name}?`,
  deletedPerson: (name) => `He borrado a ${name}.`,
  deletedEntry: (name, text) => `Borrado de ${name}: ${text}`,
  noEntryMatch: (name, q) => `Nada de ${name} coincide con "${q}".`,
  backup: (people, last) => `Aquí tienes el panel de copia de seguridad. ${people} ${plural(people, 'persona guardada', 'personas guardadas')}; ${last ? `última copia: ${last}` : 'aún sin copia'}.`,
  nudge: 'Consejo: hace tiempo que no haces copia de seguridad. Di "copia de seguridad" para guardarla.',
  needPerson: '¿De qué persona?',
  needText: '¿Qué quieres que guarde?',
  needOther: '¿Quién es la otra persona?',
  needType: '¿Qué relación tienen (por ejemplo pareja, hermanos, amistad)?',
  needField: '¿Qué cambio: nombre, apodo, relación, cumpleaños, pronombres, cada cuánto hablar o último contacto?',
  badKind: (k, kinds) => `No sé qué tipo de dato es "${k}". Usa uno de: ${kinds.join(', ')}.`,
  badDate: (d) => `No entiendo la fecha "${d}". Usa una fecha como 2026-04-12, "ayer" o "12 de abril".`,
  unknownAction: (a, actions) => `Acción desconocida "${a}". Usa una de: ${actions.join(', ')}.`,
  storageFull: 'Kin se ha quedado sin espacio en este teléfono. Haz una copia de seguridad y borra notas antiguas.',
  failed: (msg) => `Kin no ha podido hacerlo: ${msg}`,
  noData: 'Kin aún no tiene datos. Cuéntame algo de alguien para empezar.',
};

const CATALOGS = { en, es };

export function messages(lang = 'en') {
  return CATALOGS[String(lang || 'en').toLowerCase().split('-')[0]] ?? en;
}

export const languageOf = (lang) => (String(lang || 'en').toLowerCase().split('-')[0] in CATALOGS ? String(lang).toLowerCase().split('-')[0] : 'en');
