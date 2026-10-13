// Validate frontmatter against the Lore JSON Schemas (spec/schemas), with messages meant for
// people. This interprets the subset of JSON Schema 2020-12 the Lore schemas use; it throws on any
// other keyword so a schema change cannot be silently ignored.

import { SCHEMAS } from './schemas.generated.mjs';

export const SPEC_VERSION = '0.1';
export const SCHEMA_BASE = `https://quantumbboy.github.io/lore/spec/${SPEC_VERSION}/`;

const ANNOTATIONS = new Set(['$schema', '$id', '$defs', 'title', 'description', '$comment', 'default']);

const typeOf = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
};

const TYPE_WORDS = {
  object: 'a set of fields',
  array: 'a list',
  string: 'text',
  boolean: 'true or false',
  number: 'a number',
  integer: 'a whole number',
  null: 'empty',
};

function matchesType(value, type) {
  const t = typeOf(value);
  if (type === 'number') return t === 'number' || t === 'integer';
  return t === type;
}

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Is this YYYY-MM-DD a real calendar date? */
export function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = m.slice(1).map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const FORMATS = {
  date: isRealDate,
  'date-time': (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s) && isRealDate(s.slice(0, 10)) && !Number.isNaN(Date.parse(s)),
};

function resolveRef(ref, baseId) {
  const [file, fragment = ''] = ref.split('#');
  const id = file ? new URL(file, baseId).href : baseId;
  let node = SCHEMAS[id];
  if (!node) throw new Error(`unknown schema ${id}`);
  for (const part of fragment.split('/').filter(Boolean)) node = node[decodeURIComponent(part)];
  if (!node) throw new Error(`unknown schema reference ${ref}`);
  return { schema: node, baseId: id };
}

const fieldName = (path) => (path === '' ? 'the frontmatter' : path.slice(1).replace(/\//g, '.'));

function check(schema, value, path, baseId, hint, errors) {
  if (schema === true) return;
  if (schema === false) {
    errors.push({ path, message: 'is not allowed' });
    return;
  }
  const description = schema.description ?? hint;
  const fail = (message) => errors.push({ path, message });

  for (const key of Object.keys(schema)) {
    if (ANNOTATIONS.has(key)) continue;
    switch (key) {
      case '$ref': {
        const r = resolveRef(schema.$ref, baseId);
        check(r.schema, value, path, r.baseId, description, errors);
        break;
      }
      case 'type':
        if (!matchesType(value, schema.type)) {
          fail(`must be ${TYPE_WORDS[schema.type] ?? schema.type}${description && schema.type !== 'object' && schema.type !== 'array' ? ` (${description})` : ''}`);
          return;
        }
        break;
      case 'enum':
        if (!schema.enum.some((e) => deepEqual(e, value))) fail(`must be one of: ${schema.enum.join(', ')}`);
        break;
      case 'const':
        if (!deepEqual(schema.const, value)) fail(`must be ${JSON.stringify(schema.const)}${description ? ` (${description})` : ''}`);
        break;
      case 'pattern':
        if (typeof value === 'string' && !new RegExp(schema.pattern, 'u').test(value)) {
          fail(description ? `is not valid: ${description}` : `does not match ${schema.pattern}`);
        }
        break;
      case 'format':
        if (typeof value === 'string' && FORMATS[schema.format] && !FORMATS[schema.format](value)) {
          fail(schema.format === 'date' ? 'is not a real calendar date' : 'is not a valid date and time');
        }
        break;
      case 'minLength':
        if (typeof value === 'string' && [...value].length < schema.minLength) fail(schema.minLength === 1 ? 'must not be empty' : `must have at least ${schema.minLength} characters`);
        break;
      case 'maxLength':
        if (typeof value === 'string' && [...value].length > schema.maxLength) fail(`is too long (at most ${schema.maxLength} characters)`);
        break;
      case 'minProperties':
        if (typeOf(value) === 'object' && Object.keys(value).length < schema.minProperties) fail('must not be empty');
        break;
      case 'required':
        if (typeOf(value) === 'object') {
          for (const k of schema.required) {
            if (!Object.prototype.hasOwnProperty.call(value, k)) errors.push({ path, message: `needs the field "${k}"` });
          }
        }
        break;
      case 'properties':
      case 'patternProperties':
      case 'additionalProperties':
        if (key === 'properties' || (key === 'patternProperties' && !schema.properties) || (key === 'additionalProperties' && !schema.properties && !schema.patternProperties)) {
          checkObject(schema, value, path, baseId, errors);
        }
        break;
      case 'items':
        if (Array.isArray(value)) value.forEach((item, i) => check(schema.items, item, `${path}/${i}`, baseId, undefined, errors));
        break;
      case 'uniqueItems':
        if (schema.uniqueItems && Array.isArray(value)) {
          const seen = new Set(value.map((v) => JSON.stringify(v)));
          if (seen.size !== value.length) fail('has the same item more than once');
        }
        break;
      case 'anyOf':
      case 'oneOf': {
        const results = schema[key].map((branch) => {
          const errs = [];
          check(branch, value, path, baseId, undefined, errs);
          return errs;
        });
        const passing = results.filter((r) => r.length === 0).length;
        if (key === 'anyOf' ? passing === 0 : passing !== 1) {
          // When only one branch fits the value's type, its errors say most about what is wrong.
          const fitting = schema[key].map((b, i) => [b, i]).filter(([b]) => fitsType(b, value, baseId));
          if (passing === 0 && fitting.length === 1) errors.push(...results[fitting[0][1]]);
          else fail(description ? `is not valid: ${description}` : 'is not valid');
        }
        break;
      }
      case 'if':
        if (schema.then) {
          const probe = [];
          check(schema.if, value, path, baseId, undefined, probe);
          if (probe.length === 0) check(schema.then, value, path, baseId, undefined, errors);
        }
        break;
      case 'then':
        break;
      default:
        throw new Error(`unsupported JSON Schema keyword "${key}"`);
    }
  }
}

/** Types a schema can accept, or null when it does not say. */
function impliedTypes(schema, baseId) {
  if (schema === true || schema === false) return null;
  if (schema.$ref) {
    const r = resolveRef(schema.$ref, baseId);
    return impliedTypes(r.schema, r.baseId);
  }
  if (schema.type) return [schema.type];
  if (schema.enum) return [...new Set(schema.enum.map(typeOf))];
  if ('const' in schema) return [typeOf(schema.const)];
  const branches = schema.anyOf ?? schema.oneOf;
  if (branches) {
    const all = branches.map((b) => impliedTypes(b, baseId));
    return all.includes(null) ? null : [...new Set(all.flat())];
  }
  return null;
}

function fitsType(schema, value, baseId) {
  const types = impliedTypes(schema, baseId);
  if (!types) return true;
  const t = typeOf(value);
  return types.includes(t) || (t === 'integer' && types.includes('number'));
}

function checkObject(schema, value, path, baseId, errors) {
  if (typeOf(value) !== 'object') return;
  const props = schema.properties ?? {};
  const patterns = Object.entries(schema.patternProperties ?? {}).map(([p, s]) => [new RegExp(p, 'u'), s]);
  for (const [k, v] of Object.entries(value)) {
    const childPath = `${path}/${k}`;
    let matched = false;
    if (Object.prototype.hasOwnProperty.call(props, k)) {
      matched = true;
      check(props[k], v, childPath, baseId, undefined, errors);
    }
    for (const [re, s] of patterns) {
      if (re.test(k)) {
        matched = true;
        check(s, v, childPath, baseId, undefined, errors);
      }
    }
    if (!matched && 'additionalProperties' in schema) {
      if (schema.additionalProperties === false) {
        const hint = /\./.test(k) ? '' : ` (fields from other programs need a namespace, like "app.${k}")`;
        errors.push({ path: childPath, message: `is not a Lore field${hint}` });
      } else {
        check(schema.additionalProperties, v, childPath, baseId, undefined, errors);
      }
    }
  }
}

const TYPES = { me: 'me', person: 'person', index: 'index', area: 'area', common: 'common' };

/**
 * Validate frontmatter data of a file type ('me', 'person', 'index' or 'area').
 * @returns {{path: string, field: string, message: string}[]} empty when valid
 */
export function validateFrontmatter(type, data) {
  if (!TYPES[type]) throw new Error(`unknown file type "${type}"`);
  const id = `${SCHEMA_BASE}${type}.schema.json`;
  const errors = [];
  check(SCHEMAS[id], data, '', id, undefined, errors);
  const seen = new Set();
  return errors
    .map((e) => ({ ...e, field: fieldName(e.path) }))
    .filter((e) => {
      const key = `${e.path}|${e.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** "birthday is not valid: …" lines for people. */
export function formatErrors(errors) {
  return errors.map((e) => `${e.field} ${e.message}`);
}
