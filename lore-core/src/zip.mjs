// Minimal ZIP support with no dependencies. Writing uses STORE (no compression), which iOS Files,
// macOS Archive Utility, Windows and `unzip` all open. Reading also accepts DEFLATE, as produced by
// Finder or the Files app, through the platform's DecompressionStream.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2);
  const day = ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { time, day };
}

/**
 * @param {{path: string, data?: Uint8Array}[]} entries paths use '/', directories end with '/'
 * @param {Date} [mtime] fixed timestamp so builds are reproducible
 * @returns {Uint8Array}
 */
export function createZip(entries, mtime = new Date(Date.UTC(2026, 0, 1))) {
  const enc = new TextEncoder();
  const { time, day } = dosDateTime(mtime);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const isDir = entry.path.endsWith('/');
    const name = enc.encode(entry.path);
    const data = isDir ? new Uint8Array(0) : entry.data;
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // STORE
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    locals.push(new Uint8Array(local.buffer), name, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 0x0314, true); // made by: Unix, spec 2.0
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, time, true);
    central.setUint16(14, day, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    // Unix mode in the high 16 bits (drwxr-xr-x / -rw-r--r--), MS-DOS directory flag in the low bits.
    central.setUint32(38, isDir ? ((0o40755 << 16) | 0x10) >>> 0 : (0o100644 << 16) >>> 0, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.length + data.length;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Reading

export class ZipError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ZipError';
  }
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new ZipError('This device cannot read compressed zip files. Export again from Kin, or zip without compression.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Read a ZIP archive (STORE and DEFLATE, no encryption, no ZIP64).
 * @param {Uint8Array|ArrayBuffer} input
 * @param {{maxBytes?: number}} [options] refuse archives that unpack to more than this
 * @returns {Promise<{path: string, directory: boolean, data: Uint8Array}[]>}
 */
export async function readZip(input, { maxBytes = 100e6 } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new ZipError('This is not a zip file.');
  const count = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new ZipError('ZIP64 archives are not supported.');
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const latin1 = new TextDecoder('latin1');
  const entries = [];
  let total = 0;
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new ZipError('The zip file is damaged.');
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const compressed = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const rawName = bytes.subarray(p + 46, p + 46 + nameLen);
    let path;
    try {
      path = utf8.decode(rawName);
    } catch {
      path = latin1.decode(rawName);
    }
    p += 46 + nameLen + extraLen + commentLen;
    if (flags & 1) throw new ZipError('Encrypted zip files are not supported.');
    total += size;
    if (total > maxBytes) throw new ZipError(`The archive is too large (more than ${Math.round(maxBytes / 1e6)} MB unpacked).`);
    const directory = path.endsWith('/');
    if (directory) {
      entries.push({ path, directory, data: new Uint8Array(0) });
      continue;
    }
    if (view.getUint32(local, true) !== 0x04034b50) throw new ZipError('The zip file is damaged.');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + compressed);
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = await inflateRaw(raw);
    else throw new ZipError(`Unsupported compression method ${method} in ${path}.`);
    if (data.length !== size || crc32(data) !== crc) throw new ZipError(`${path} is damaged (checksum mismatch).`);
    entries.push({ path, directory, data });
  }
  return entries;
}
