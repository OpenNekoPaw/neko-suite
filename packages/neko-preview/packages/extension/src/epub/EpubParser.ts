/**
 * EpubParser — extracts Table of Contents from an EPUB file.
 *
 * Uses partial file reads (EOCD → central directory → specific entries only)
 * so even 100 MB manga EPUBs return a TOC in milliseconds without reading
 * image data.  No external dependencies.
 */

import * as fs from 'fs/promises';
import * as zlib from 'zlib';

export interface TocEntry {
  label: string;
  href: string;
  depth: number;
}

// =============================================================================
// Public API
// =============================================================================

/** Parse EPUB file at the given path and return its table of contents. */
export async function readEpubToc(filePath: string): Promise<TocEntry[]> {
  const fh = await fs.open(filePath, 'r');
  try {
    const { size: fileSize } = await fh.stat();

    // Step 1: Read last ≤65 KB to locate EOCD record (avoids reading whole file)
    const tailSize = Math.min(65_558, fileSize);
    const tail = Buffer.alloc(tailSize);
    await fh.read(tail, 0, tailSize, fileSize - tailSize);

    const eocdRel = findEocd(tail);
    if (eocdRel === -1) return [];
    const eocdAbs = fileSize - tailSize + eocdRel;
    void eocdAbs; // only used to confirm position; offsets come from EOCD fields

    const numEntries = tail.readUInt16LE(eocdRel + 10);
    const cdSize = tail.readUInt32LE(eocdRel + 12);
    const cdOffset = tail.readUInt32LE(eocdRel + 16);

    // Step 2: Read central directory only
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOffset);
    const zipIndex = buildZipIndexFromCd(cd, numEntries);

    // Step 3: Read only the small XML files needed for TOC
    const readEntry = (name: string) => readZipEntryFh(fh, zipIndex, name);

    const containerXml = await readEntry('META-INF/container.xml');
    if (!containerXml) return [];
    const opfPath = /full-path="([^"]+)"/i.exec(containerXml)?.[1];
    if (!opfPath) return [];

    const opfXml = await readEntry(opfPath);
    if (!opfXml) return [];
    const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

    // EPUB3 nav
    const navHref =
      /<item\b[^>]*\bproperties="[^"]*\bnav\b[^"]*"[^>]*\bhref="([^"]+)"/i.exec(opfXml)?.[1] ??
      /<item\b[^>]*\bhref="([^"]+)"[^>]*\bproperties="[^"]*\bnav\b[^"]*"/i.exec(opfXml)?.[1];

    if (navHref) {
      const navXml = await readEntry(opfDir + navHref);
      if (navXml) {
        const entries = parseNavXhtml(navXml);
        if (entries.length > 0) return entries;
      }
    }

    // EPUB2 NCX
    const ncxHref =
      /<item\b[^>]*\bmedia-type="application\/x-dtbncx\+xml"[^>]*\bhref="([^"]+)"/i.exec(
        opfXml,
      )?.[1] ??
      /<item\b[^>]*\bhref="([^"]+)"[^>]*\bmedia-type="application\/x-dtbncx\+xml"/i.exec(
        opfXml,
      )?.[1];

    if (ncxHref) {
      const ncxXml = await readEntry(opfDir + ncxHref);
      if (ncxXml) {
        const entries = parseNcx(ncxXml);
        if (entries.length > 0) return entries;
      }
    }

    // Spine fallback (no extra reads needed — spine is already in OPF)
    return parseSpine(opfXml, opfDir);
  } finally {
    await fh.close();
  }
}

// =============================================================================
// ZIP reader — random access via file handle
// =============================================================================

interface ZipEntry {
  compression: number;
  compressedSize: number;
  /** Absolute offset of the local file header in the ZIP */
  localOffset: number;
}

function findEocd(buf: Buffer): number {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

/** Build name → entry from central directory buffer. */
function buildZipIndexFromCd(cd: Buffer, numEntries: number): Map<string, ZipEntry> {
  const index = new Map<string, ZipEntry>();
  let pos = 0;
  for (let i = 0; i < numEntries && pos + 46 <= cd.length; i++) {
    if (cd.readUInt32LE(pos) !== 0x02014b50) break;
    const compression = cd.readUInt16LE(pos + 10);
    const compressedSize = cd.readUInt32LE(pos + 20);
    const fnLen = cd.readUInt16LE(pos + 28);
    const extraLen = cd.readUInt16LE(pos + 30);
    const commentLen = cd.readUInt16LE(pos + 32);
    const localOffset = cd.readUInt32LE(pos + 42);
    const name = cd.toString('utf8', pos + 46, pos + 46 + fnLen);
    pos += 46 + fnLen + extraLen + commentLen;
    index.set(name, { compression, compressedSize, localOffset });
  }
  return index;
}

/** Read and decompress a single ZIP entry via a file handle (random access). */
async function readZipEntryFh(
  fh: fs.FileHandle,
  index: Map<string, ZipEntry>,
  name: string,
): Promise<string | null> {
  const entry = index.get(name);
  if (!entry) return null;

  // Read local file header to get actual data offset
  const localHdr = Buffer.alloc(30);
  await fh.read(localHdr, 0, 30, entry.localOffset);
  if (localHdr.readUInt32LE(0) !== 0x04034b50) return null;
  const localFnLen = localHdr.readUInt16LE(26);
  const localExtraLen = localHdr.readUInt16LE(28);
  const dataOffset = entry.localOffset + 30 + localFnLen + localExtraLen;

  const compressed = Buffer.alloc(entry.compressedSize);
  await fh.read(compressed, 0, entry.compressedSize, dataOffset);

  try {
    const raw = entry.compression === 0 ? compressed : zlib.inflateRawSync(compressed);
    return raw.toString('utf8');
  } catch {
    return null;
  }
}

// =============================================================================
// EPUB3 nav.xhtml parser
// =============================================================================

function parseNavXhtml(xml: string): TocEntry[] {
  const tocNavMatch = /<nav\b[^>]*epub:type="[^"]*\btoc\b[^"]*"[^>]*>([\s\S]*?)<\/nav>/i.exec(xml);
  const content = tocNavMatch?.[1] ?? xml;

  const entries: TocEntry[] = [];
  const re = /<(li|a)\b([^>]*)>([\s\S]*?)(?=<\/\1>)/gi;
  let depth = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(content)) !== null) {
    const tag = match[1].toLowerCase();
    if (tag === 'li') {
      depth = countOlDepth(content, match.index);
    } else {
      const hrefMatch = /href="([^"]+)"/.exec(match[2]);
      if (!hrefMatch) continue;
      const label = stripTags(match[3]).trim();
      if (label && hrefMatch[1]) entries.push({ label, href: hrefMatch[1], depth });
    }
  }
  return entries;
}

function countOlDepth(content: string, pos: number): number {
  let opens = 0,
    closes = 0;
  for (let i = 0; i < pos; i++) {
    if (content[i] === '<') {
      const tag = content.slice(i, i + 5).toLowerCase();
      if (tag.startsWith('<ol')) opens++;
      else if (tag.startsWith('</ol')) closes++;
    }
  }
  return Math.max(0, opens - closes - 1);
}

// =============================================================================
// EPUB2 toc.ncx parser
// =============================================================================

function parseNcx(xml: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const stack: number[] = [];
  const re =
    /(<navPoint\b[^>]*>|<\/navPoint>|<text[^>]*>([\s\S]*?)<\/text>|<content\b[^>]*src="([^"]+)")/g;
  let lastLabel = '';
  let match: RegExpExecArray | null;

  while ((match = re.exec(xml)) !== null) {
    const full = match[0];
    if (full.startsWith('<navPoint')) {
      stack.push(0);
    } else if (full.startsWith('</navPoint>')) {
      stack.pop();
    } else if (full.startsWith('<text')) {
      lastLabel = stripTags(match[2] ?? '').trim();
    } else if (match[3]) {
      if (lastLabel) {
        entries.push({ label: lastLabel, href: match[3], depth: Math.max(0, stack.length - 1) });
        lastLabel = '';
      }
    }
  }
  return entries;
}

// =============================================================================
// Spine fallback (uses already-loaded OPF, no extra reads)
// =============================================================================

function parseSpine(opfXml: string, opfDir: string): TocEntry[] {
  const manifest = new Map<string, string>();
  const itemRe = /<item\b[^>]*\bid="([^"]+)"[^>]*\bhref="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(opfXml)) !== null) manifest.set(m[1], m[2]);

  const spineMatch = /<spine\b[^>]*>([\s\S]*?)<\/spine>/i.exec(opfXml);
  if (!spineMatch) return [];

  const entries: TocEntry[] = [];
  const idrefRe = /idref="([^"]+)"/gi;
  let idx = 1;
  while ((m = idrefRe.exec(spineMatch[1])) !== null) {
    const href = manifest.get(m[1]);
    if (href) entries.push({ label: `Section ${idx++}`, href: opfDir + href, depth: 0 });
  }
  return entries;
}

// =============================================================================
// Utilities
// =============================================================================

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
