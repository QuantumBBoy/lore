// Sections of a person file (spec section 8.3), in their recommended order.

export const PERSON_SECTIONS = [
  { id: 'likes', title: 'Likes & dislikes', es: 'Gustos' },
  { id: 'sizes', title: 'Sizes', es: 'Tallas' },
  { id: 'diet', title: 'Dietary restrictions', es: 'Restricciones alimentarias' },
  { id: 'gift-ideas', title: 'Gift ideas', es: 'Ideas de regalo' },
  { id: 'gifts-given', title: 'Gifts given', es: 'Regalos hechos' },
  { id: 'plan-ideas', title: 'Plan ideas', es: 'Planes' },
  { id: 'follow-ups', title: 'Follow-ups', es: 'Pendiente de preguntar' },
  { id: 'promises', title: 'Promises', es: 'Promesas y préstamos' },
  { id: 'notes', title: 'Notes log', es: 'Notas' },
];

const BY_ID = new Map(PERSON_SECTIONS.map((s, i) => [s.id, { ...s, order: i }]));
const BY_TITLE = new Map(PERSON_SECTIONS.map((s) => [s.title.toLowerCase(), s.id]));

export const SECTION_IDS = PERSON_SECTIONS.map((s) => s.id);

export const isKnownSection = (id) => BY_ID.has(id);

/** Id of a section from its heading text and attribute id (spec 9.1). */
export function sectionIdFor(title, attrId) {
  if (attrId) return attrId;
  return BY_TITLE.get(title.trim().toLowerCase()) ?? null;
}

export const sectionOrder = (id) => BY_ID.get(id)?.order ?? Infinity;

/** Heading text for a new section in `language`; non-English headings carry the id. */
export function headingFor(id, language = 'en') {
  const s = BY_ID.get(id);
  if (!s) return { title: id, id };
  const lang = String(language || 'en').toLowerCase().split('-')[0];
  if (lang === 'es' && s.es) return { title: s.es, id };
  return { title: s.title, id: null };
}

/** How entries in each section are written (spec 8.3). */
export const SECTION_RULES = {
  'gift-ideas': { dated: 'recommended' },
  'gifts-given': { dated: 'required' },
  'plan-ideas': { dated: 'recommended' },
  'follow-ups': { dated: 'recommended', checkbox: true },
  promises: { dated: 'recommended', checkbox: true },
  notes: { dated: 'required', newestFirst: true },
};
