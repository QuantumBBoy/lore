// lore-core: read, write, validate and query Lore folders (spec/SPEC.md). No dependencies; runs
// in browsers (including iOS WebKit) and Node.js. Node-only helpers live in node.mjs.

export { LoreError, LoreFolder, INVERSE_LINK, AREA_FILES, VERSION, GENERATOR } from './folder.mjs';
export { LoreFile } from './file.mjs';
export { LoreFormatError } from './frontmatter.mjs';
export { YamlError, parseYaml, stringifyYaml } from './yaml.mjs';
export { SPEC_VERSION, SUPPORTED_VERSIONS, validateFrontmatter, formatErrors } from './schema.mjs';
export { PERSON_SECTIONS, SECTION_IDS, headingFor } from './sections.mjs';
export { parseAttributes, formatAttributes } from './attributes.mjs';
export { parseEntryLine, formatEntryLine } from './body.mjs';
export { LEVELS, fileLevel, fieldLevel, itemLevel, sectionLevel, entryLevel, isVisible } from './sensitivity.mjs';
export {
  today,
  parsePersonDate,
  nextOccurrence,
  addCadence,
  addDays,
  daysBetween,
  isCadence,
  formatShortDate,
} from './dates.mjs';
export { slugify, normalizeText, truncate } from './text.mjs';
export { matchPerson } from './match.mjs';
export { upcoming, overdue, giftHistory, findGiven, giftContext, brief, personSummary, sameGift } from './queries.mjs';
export { phrases, SUPPORTED_LANGUAGES } from './i18n.mjs';
export { exportArchive, importArchive, planImport, applyImport, archiveName } from './archive.mjs';
export { createZip, readZip, ZipError } from './zip.mjs';
