// YAML for Lore frontmatter: the subset of YAML 1.2 (core schema) that Lore files use, with no
// dependencies. Supported: block mappings and sequences (including sequences at the same indent
// as their key), flow sequences and mappings, plain, single- and double-quoted scalars (also over
// several lines), literal and folded block scalars, comments. Rejected with a clear error, as the
// spec requires: anchors, aliases, tags, directives, document markers and complex keys.

export class YamlError extends Error {
  constructor(message, line) {
    super(line ? `YAML line ${line}: ${message}` : `YAML: ${message}`);
    this.name = 'YamlError';
    this.line = line;
  }
}

const NULLS = new Set(['', '~', 'null', 'Null', 'NULL']);
const TRUES = new Set(['true', 'True', 'TRUE']);
const FALSES = new Set(['false', 'False', 'FALSE']);
const INT = /^[-+]?[0-9]+$/;
const OCT = /^0o[0-7]+$/;
const HEX = /^0x[0-9a-fA-F]+$/;
const FLOAT = /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$/;
const INF = /^[-+]?\.(?:inf|Inf|INF)$/;
const NAN = /^\.(?:nan|NaN|NAN)$/;

/** Resolve a plain scalar with the YAML 1.2 core schema. */
export function resolvePlain(s) {
  if (NULLS.has(s)) return null;
  if (TRUES.has(s)) return true;
  if (FALSES.has(s)) return false;
  if (INT.test(s)) return Number(s);
  if (OCT.test(s)) return parseInt(s.slice(2), 8);
  if (HEX.test(s)) return parseInt(s.slice(2), 16);
  if (FLOAT.test(s)) return Number(s);
  if (INF.test(s)) return s.startsWith('-') ? -Infinity : Infinity;
  if (NAN.test(s)) return NaN;
  return s;
}

const ESCAPES = {
  0: '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b',
  ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0', L: '\u2028', P: '\u2029',
};

/** Fold the lines of a multi-line flow scalar: single breaks become spaces, blank lines newlines. */
function foldLines(parts) {
  let out = '';
  let pendingBreaks = 0;
  parts.forEach((part, i) => {
    if (i === 0) {
      out = part;
      return;
    }
    if (part === '') {
      pendingBreaks++;
      return;
    }
    out += pendingBreaks ? '\n'.repeat(pendingBreaks) : ' ';
    out += part;
    pendingBreaks = 0;
  });
  if (pendingBreaks) out += '\n'.repeat(pendingBreaks);
  return out;
}

/**
 * Read a quoted scalar starting at text[i] (a quote). Returns {value, end} where end is the index
 * after the closing quote, or null if the string is not closed in `text`.
 */
function readQuoted(text, i, line) {
  const q = text[i];
  let j = i + 1;
  let raw = '';
  while (j < text.length) {
    const c = text[j];
    if (q === "'" && c === "'") {
      if (text[j + 1] === "'") {
        raw += "''";
        j += 2;
        continue;
      }
      return { value: decodeQuoted(raw, q, line), end: j + 1 };
    }
    if (q === '"' && c === '\\') {
      raw += c + (text[j + 1] ?? '');
      j += 2;
      continue;
    }
    if (q === '"' && c === '"') return { value: decodeQuoted(raw, q, line), end: j + 1 };
    raw += c;
    j++;
  }
  return null;
}

function decodeQuoted(raw, q, line) {
  // Lines inside a multi-line quoted scalar are folded; leading/trailing spaces of inner lines go.
  const lines = raw.split('\n');
  const folded = lines.length === 1
    ? raw
    : foldLines(lines.map((l, i) => (i === 0 ? l.replace(/[ \t]+$/, '') : i === lines.length - 1 ? l.replace(/^[ \t]+/, '') : l.trim())));
  if (q === "'") return folded.replace(/''/g, "'");
  let out = '';
  for (let i = 0; i < folded.length; i++) {
    const c = folded[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    const e = folded[++i];
    if (e === undefined) throw new YamlError('unfinished escape in double-quoted string', line);
    if (e in ESCAPES) {
      out += ESCAPES[e];
    } else if (e === 'x' || e === 'u' || e === 'U') {
      const len = { x: 2, u: 4, U: 8 }[e];
      const hex = folded.slice(i + 1, i + 1 + len);
      if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(hex)) throw new YamlError(`bad \\${e} escape`, line);
      out += String.fromCodePoint(parseInt(hex, 16));
      i += len;
    } else if (e === '\n') {
      // escaped line break: join without a space
    } else {
      throw new YamlError(`unknown escape \\${e}`, line);
    }
  }
  return out;
}

/** Index of a comment ("#" at the start or after whitespace, outside quotes), or -1. */
function commentStart(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (quote === '"' && c === '\\') i++;
      else if (c === quote) {
        if (quote === "'" && text[i + 1] === "'") i++;
        else quote = null;
      }
      continue;
    }
    if (c === '#' && (i === 0 || /\s/.test(text[i - 1]))) return i;
    // Quotes only open a quoted scalar at the start of a value or of a flow item.
    if ((c === '"' || c === "'") && (i === 0 || /[\s,[{:]/.test(text[i - 1]))) quote = c;
  }
  return -1;
}

function stripComment(text) {
  const i = commentStart(text);
  return (i === -1 ? text : text.slice(0, i)).replace(/\s+$/, '');
}

function checkNotSpecial(value, line) {
  if (/^[&*!%@`]/.test(value)) {
    const what = { '&': 'anchors', '*': 'aliases', '!': 'tags', '%': 'directives' }[value[0]] ?? `"${value[0]}" at the start of a value`;
    throw new YamlError(`${what} are not allowed in Lore frontmatter`, line);
  }
  if (/^\?(\s|$)/.test(value)) throw new YamlError('complex keys are not allowed', line);
}

/**
 * Split "key: rest" at the start of `content`. Returns {key, rest} or null if the line is not a
 * mapping entry.
 */
export function splitKey(content, line) {
  if (content.startsWith('"') || content.startsWith("'")) {
    const q = readQuoted(content, 0, line);
    if (!q) return null;
    const after = content.slice(q.end);
    const m = /^\s*:(?=\s|$)/.exec(after);
    if (!m) return null;
    return { key: q.value, rest: after.slice(m[0].length) };
  }
  if (/^[[\]{},#|>]/.test(content) || /^[-?](\s|$)/.test(content)) return null;
  const limit = commentStart(content);
  const scan = limit === -1 ? content : content.slice(0, limit);
  const m = /:(?=\s|$)/.exec(scan);
  if (!m) return null;
  const key = scan.slice(0, m.index).replace(/\s+$/, '');
  if (key === '') return null;
  checkNotSpecial(key, line);
  if (key === '<<') throw new YamlError('merge keys (<<) are not allowed', line);
  return { key, rest: content.slice(m.index + 1) };
}

/** Parse a flow collection or flow scalar in `text` from index i. */
function parseFlow(text, i, line) {
  const skip = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const value = () => {
    skip();
    const c = text[i];
    if (c === '[') {
      i++;
      const arr = [];
      skip();
      if (text[i] === ']') {
        i++;
        return arr;
      }
      for (;;) {
        arr.push(value());
        skip();
        if (text[i] === ',') {
          i++;
          skip();
          if (text[i] === ']') {
            i++;
            return arr;
          }
          continue;
        }
        if (text[i] === ']') {
          i++;
          return arr;
        }
        throw new YamlError('expected "," or "]" in flow sequence', line);
      }
    }
    if (c === '{') {
      i++;
      const obj = {};
      skip();
      if (text[i] === '}') {
        i++;
        return obj;
      }
      for (;;) {
        skip();
        const key = scalar(true);
        if (typeof key !== 'string' && key !== null && typeof key !== 'number' && typeof key !== 'boolean') {
          throw new YamlError('flow mapping keys must be scalars', line);
        }
        const k = String(key);
        skip();
        let v = null;
        if (text[i] === ':') {
          i++;
          skip();
          v = text[i] === ',' || text[i] === '}' ? null : value();
        }
        if (Object.prototype.hasOwnProperty.call(obj, k)) throw new YamlError(`duplicate key "${k}"`, line);
        obj[k] = v;
        skip();
        if (text[i] === ',') {
          i++;
          skip();
          if (text[i] === '}') {
            i++;
            return obj;
          }
          continue;
        }
        if (text[i] === '}') {
          i++;
          return obj;
        }
        throw new YamlError('expected "," or "}" in flow mapping', line);
      }
    }
    return scalar(false);
  };
  const scalar = (isKey) => {
    const c = text[i];
    if (c === '"' || c === "'") {
      const q = readQuoted(text, i, line);
      if (!q) throw new YamlError('unclosed quoted string', line);
      i = q.end;
      return q.value;
    }
    checkNotSpecial(text.slice(i), line);
    let j = i;
    while (j < text.length) {
      const ch = text[j];
      if (ch === ',' || ch === ']' || ch === '}' || ch === '[' || ch === '{') break;
      if (ch === ':' && (j + 1 >= text.length || /[\s,\]}]/.test(text[j + 1]))) break;
      if (isKey && ch === ':') break;
      j++;
    }
    const raw = text.slice(i, j).trim();
    i = j;
    return resolvePlain(raw);
  };
  const v = value();
  skip();
  return { value: v, end: i };
}

const isSeqItem = (content) => content === '-' || content.startsWith('- ');

/** Unclosed brackets in a flow collection, ignoring quoted text. */
function flowDepth(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (quote === '"' && c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
  }
  return depth;
}

/** Parse the frontmatter text. An empty document is an empty mapping. */
export function parseYaml(text, { firstLine = 1 } = {}) {
  const lines = text.split('\n');
  const n = lines.length;
  let pos = 0;
  const lineNo = (p) => p + firstLine;

  for (let p = 0; p < n; p++) {
    const lead = /^[ \t]*/.exec(lines[p])[0];
    if (lead.includes('\t')) throw new YamlError('tabs are not allowed for indentation', lineNo(p));
    const content = lines[p].slice(lead.length);
    if (lead === '' && (/^---(\s|$)/.test(content) || /^\.\.\.(\s|$)/.test(content))) {
      throw new YamlError('document markers are not allowed inside frontmatter', lineNo(p));
    }
    if (lead === '' && content.startsWith('%')) throw new YamlError('directives are not allowed', lineNo(p));
  }

  const indentOf = (p) => /^ */.exec(lines[p])[0].length;
  const contentOf = (p) => lines[p].slice(indentOf(p));
  const isBlank = (p) => {
    const c = contentOf(p);
    return c === '' || c.startsWith('#');
  };
  const skipBlank = () => {
    while (pos < n && isBlank(pos)) pos++;
  };
  const nextNonBlank = (p) => {
    while (p < n && isBlank(p)) p++;
    return p;
  };

  function parseBlockScalar(header, parentIndent, line) {
    const m = /^([|>])([-+]?)([1-9]?)([-+]?)$/.exec(header);
    if (!m || (m[2] && m[4])) throw new YamlError(`bad block scalar header "${header}"`, line);
    const folded = m[1] === '>';
    const chomp = m[2] || m[4];
    let indent = m[3] ? parentIndent + Number(m[3]) : null;
    const body = [];
    while (pos < n) {
      const raw = lines[pos];
      if (raw.trim() === '') {
        body.push('');
        pos++;
        continue;
      }
      const ind = indentOf(pos);
      if (indent === null) {
        if (ind <= parentIndent) break;
        indent = ind;
      }
      if (ind < indent) break;
      body.push(raw.slice(indent));
      pos++;
    }
    let trailing = 0;
    while (body.length && body[body.length - 1] === '') {
      body.pop();
      trailing++;
    }
    let text;
    if (!folded) {
      text = body.join('\n');
    } else {
      text = '';
      for (let k = 0; k < body.length; k++) {
        const l = body[k];
        if (k === 0) {
          text = l;
          continue;
        }
        const prev = body[k - 1];
        const moreIndented = (s) => /^\s/.test(s);
        if (l === '') text += '\n';
        else if (prev === '' || moreIndented(l) || moreIndented(prev)) text += (prev === '' ? '' : '\n') + l;
        else text += ' ' + l;
      }
    }
    if (body.length === 0) return chomp === '+' ? '\n'.repeat(trailing) : '';
    if (chomp === '-') return text;
    if (chomp === '+') return text + '\n' + '\n'.repeat(trailing);
    return text + '\n';
  }

  // A value written after "key:" or "- ", possibly continuing on more-indented lines.
  function parseInline(rawRest, parentIndent, startPos) {
    const line = lineNo(startPos);
    const rest = rawRest.replace(/^\s+/, '');
    const value = stripComment(rest);
    if (value === '') return undefined;
    checkNotSpecial(value, line);
    if (value[0] === '|' || value[0] === '>') return parseBlockScalar(value, parentIndent, line);
    if (value[0] === '[' || value[0] === '{') {
      // A flow collection may continue on more-indented lines until its brackets close.
      let text = value;
      while (flowDepth(text) > 0 && pos < n && (isBlank(pos) || indentOf(pos) > parentIndent)) {
        if (!isBlank(pos)) text += ' ' + stripComment(contentOf(pos));
        pos++;
      }
      const r = parseFlow(text, 0, line);
      if (r.end !== text.length) throw new YamlError('unexpected text after flow collection', line);
      return r.value;
    }
    if (value[0] === '"' || value[0] === "'") {
      let text = rest;
      for (;;) {
        const q = readQuoted(text, 0, line);
        if (q) {
          const after = stripComment(text.slice(q.end));
          if (after.trim() !== '') throw new YamlError('unexpected text after quoted string', line);
          return q.value;
        }
        if (pos >= n) throw new YamlError('unclosed quoted string', line);
        text += '\n' + lines[pos];
        pos++;
      }
    }
    // Plain scalar, possibly folded over more-indented continuation lines.
    const parts = [value];
    for (;;) {
      const p = nextNonBlank(pos);
      if (p >= n || indentOf(p) <= parentIndent) break;
      const c = contentOf(p);
      if (splitKey(c, lineNo(p)) || isSeqItem(c)) throw new YamlError('unexpected mapping or sequence inside a plain scalar', lineNo(p));
      for (let b = pos; b < p; b++) parts.push('');
      parts.push(stripComment(c));
      pos = p + 1;
    }
    return resolvePlain(foldLines(parts));
  }

  function parseNode(indent, parentIndent) {
    skipBlank();
    const content = contentOf(pos);
    if (isSeqItem(content)) return parseSequence(indent);
    if (splitKey(content, lineNo(pos))) return parseMapping(indent);
    const start = pos;
    pos++;
    return parseInline(content, parentIndent, start) ?? null;
  }

  function valueAfterIndicator(rest, ownerIndent, startPos, allowCompactSeq) {
    const inline = parseInline(rest, ownerIndent, startPos);
    if (inline !== undefined) return inline;
    const p = nextNonBlank(pos);
    if (p >= n) return null;
    const ind = indentOf(p);
    if (ind > ownerIndent) {
      pos = p;
      return parseNode(ind, ownerIndent);
    }
    if (allowCompactSeq && ind === ownerIndent && isSeqItem(contentOf(p))) {
      pos = p;
      return parseSequence(ind);
    }
    return null;
  }

  function parseMapping(indent) {
    const obj = {};
    for (;;) {
      skipBlank();
      if (pos >= n) break;
      const ind = indentOf(pos);
      if (ind < indent) break;
      const content = contentOf(pos);
      if (ind > indent) throw new YamlError('unexpected indentation', lineNo(pos));
      const kv = splitKey(content, lineNo(pos));
      if (!kv) {
        if (isSeqItem(content)) break;
        throw new YamlError(`expected "key: value", got "${content}"`, lineNo(pos));
      }
      if (Object.prototype.hasOwnProperty.call(obj, kv.key)) throw new YamlError(`duplicate key "${kv.key}"`, lineNo(pos));
      const start = pos;
      pos++;
      obj[kv.key] = valueAfterIndicator(kv.rest, indent, start, true);
    }
    return obj;
  }

  function parseSequence(indent) {
    const arr = [];
    for (;;) {
      skipBlank();
      if (pos >= n) break;
      const ind = indentOf(pos);
      if (ind < indent) break;
      if (ind > indent) throw new YamlError('unexpected indentation', lineNo(pos));
      const content = contentOf(pos);
      if (!isSeqItem(content)) break;
      const after = content === '-' ? '' : content.slice(2);
      const trimmed = after.replace(/^ +/, '');
      const itemIndent = ind + (content.length - trimmed.length);
      const value = stripComment(trimmed);
      if (value !== '' && (isSeqItem(value) || splitKey(trimmed, lineNo(pos)))) {
        // "- key: value" or "- - x": the item is a block node starting at itemIndent.
        lines[pos] = ' '.repeat(itemIndent) + trimmed;
        arr.push(parseNode(itemIndent, ind));
      } else {
        const start = pos;
        pos++;
        arr.push(valueAfterIndicator(trimmed, ind, start, false));
      }
    }
    return arr;
  }

  skipBlank();
  if (pos >= n) return {};
  const rootIndent = indentOf(pos);
  const root = parseNode(rootIndent, -1);
  skipBlank();
  if (pos < n) throw new YamlError('unexpected content (check indentation)', lineNo(pos));
  return root;
}

// ---------------------------------------------------------------------------------------------
// Serialization

const YAML11_WORDS = new Set(['y', 'n', 'yes', 'no', 'on', 'off']);

/** Can `s` be written as a plain scalar and read back as the same string by YAML 1.2 and 1.1? */
export function isPlainSafe(s, { flow = false } = {}) {
  if (s === '' || s !== s.trim()) return false;
  if (/[\x00-\x1f\x7f\x85\u2028\u2029]/.test(s)) return false;
  if (/^[[\]{},#&*!|>'"%@`]/.test(s)) return false;
  if (/^[-?:](\s|$)/.test(s)) return false;
  if (/^(---|\.\.\.)/.test(s)) return false;
  if (/:(\s|$)/.test(s) || /\s#/.test(s)) return false;
  if (flow && /[,[\]{}]/.test(s)) return false;
  if (resolvePlain(s) !== s) return false;
  if (YAML11_WORDS.has(s.toLowerCase())) return false;
  return true;
}

function quote(s) {
  let out = '"';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (code < 0x20 || code === 0x7f || code === 0x85 || code === 0x2028 || code === 0x2029) {
      out += code <= 0xff ? `\\x${code.toString(16).padStart(2, '0')}` : `\\u${code.toString(16).padStart(4, '0')}`;
    } else out += ch;
  }
  return out + '"';
}

export function formatScalar(v, { flow = false } = {}) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return '.nan';
    if (v === Infinity) return '.inf';
    if (v === -Infinity) return '-.inf';
    return String(v);
  }
  if (typeof v === 'string') return isPlainSafe(v, { flow }) ? v : quote(v);
  throw new TypeError(`cannot write ${typeof v} as a YAML scalar`);
}

const isScalar = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function formatKey(k) {
  return isPlainSafe(k) && !/[:#]/.test(k) ? k : quote(k);
}

function shortFlowList(arr) {
  if (!arr.every((x) => typeof x === 'string' && isPlainSafe(x, { flow: true }))) return null;
  const text = `[${arr.join(', ')}]`;
  return text.length <= 60 ? text : null;
}

/** Lines for `value` nested under a key or item at `indent` spaces. */
function formatBlock(value, indent) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (isScalar(item)) return [`${pad}- ${formatScalar(item)}`];
      if (Array.isArray(item)) {
        if (item.length === 0) return [`${pad}- []`];
        const inner = formatBlock(item, indent + 2);
        return [`${pad}- ${inner[0].trimStart()}`, ...inner.slice(1)];
      }
      if (isPlainObject(item)) {
        if (Object.keys(item).length === 0) return [`${pad}- {}`];
        const inner = formatMapping(item, indent + 2);
        return [`${pad}- ${inner[0].trimStart()}`, ...inner.slice(1)];
      }
      throw new TypeError('unsupported value in list');
    });
  }
  return formatMapping(value, indent);
}

function formatMapping(obj, indent) {
  return Object.entries(obj).flatMap(([k, v]) => formatEntry(k, v, indent));
}

/** Serialize one `key: value` pair as YAML lines, at `indent` spaces. */
export function formatEntry(key, value, indent = 0) {
  const pad = ' '.repeat(indent);
  const k = formatKey(key);
  if (value === undefined) throw new TypeError(`no value for "${key}"`);
  if (isScalar(value)) return [`${pad}${k}: ${formatScalar(value)}`];
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}${k}: []`];
    const flow = shortFlowList(value);
    if (flow) return [`${pad}${k}: ${flow}`];
    return [`${pad}${k}:`, ...formatBlock(value, indent + 2)];
  }
  if (isPlainObject(value)) {
    if (Object.keys(value).length === 0) return [`${pad}${k}: {}`];
    return [`${pad}${k}:`, ...formatMapping(value, indent + 2)];
  }
  throw new TypeError(`cannot write ${typeof value} for "${key}"`);
}

/** Serialize a whole mapping. */
export function stringifyYaml(obj) {
  if (!isPlainObject(obj)) throw new TypeError('top level must be a mapping');
  return formatMapping(obj, 0).join('\n');
}
