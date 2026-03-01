#!/usr/bin/env node

/**
 * One-time script: Flatten nested i18n translation objects into
 * namespaced flat MessageBundle files (Model B).
 *
 * Usage:
 *   npx tsx scripts/flatten-i18n.ts <input-en.ts> <input-zh.ts> <output-dir>
 *
 * Example:
 *   npx tsx scripts/flatten-i18n.ts \
 *     packages/neko-agent/packages/webview/src/i18n/locales/en.ts \
 *     packages/neko-agent/packages/webview/src/i18n/locales/zh-CN.ts \
 *     packages/neko-agent/packages/webview/src/i18n/locales
 *
 * Output structure:
 *   <output-dir>/en/<namespace>.ts    (flat MessageBundle per top-level key)
 *   <output-dir>/en/index.ts          (barrel export)
 *   <output-dir>/zh-cn/<namespace>.ts
 *   <output-dir>/zh-cn/index.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// Merge map: combine related small categories into one file
// ============================================================================

const MERGE_MAP: Record<string, string> = {
  masks: 'mask',
  subtitle: 'subtitles',
};

// ============================================================================
// Core: flatten nested object
// ============================================================================

function flatten(
  obj: Record<string, unknown>,
  prefix = '',
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result[fullKey] = value;
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(result, flatten(value as Record<string, unknown>, fullKey));
    }
  }
  return result;
}

// ============================================================================
// Split flat keys by top-level prefix
// ============================================================================

function splitByNamespace(
  flat: Record<string, string>,
): Record<string, Record<string, string>> {
  const namespaces: Record<string, Record<string, string>> = {};

  for (const [key, value] of Object.entries(flat)) {
    const dotIndex = key.indexOf('.');
    const topLevel = dotIndex > 0 ? key.substring(0, dotIndex) : key;
    const ns = MERGE_MAP[topLevel] ?? topLevel;

    if (!namespaces[ns]) {
      namespaces[ns] = {};
    }
    namespaces[ns][key] = value;
  }

  return namespaces;
}

// ============================================================================
// Generate TypeScript source for one namespace bundle
// ============================================================================

function generateBundleFile(
  namespace: string,
  bundle: Record<string, string>,
): string {
  const lines: string[] = [];
  lines.push(`import type { MessageBundle } from '@neko/shared';`);
  lines.push('');
  lines.push(`export const ${toIdentifier(namespace)} = {`);

  // Group keys by second-level segment for readability
  // e.g., 'chat.input.placeholder' → group='input', 'chat.send' → group=''
  let lastGroup = '';
  for (const [key, value] of Object.entries(bundle)) {
    const parts = key.split('.');
    // Second segment is the group (if 3+ segments); otherwise no group
    const group = parts.length >= 3 ? parts[1]! : '';
    if (group !== lastGroup && lastGroup !== '') {
      lines.push('');
    }
    lastGroup = group;

    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
    lines.push(`  '${key}': '${escaped}',`);
  }

  lines.push(`} as const satisfies MessageBundle;`);
  lines.push('');
  return lines.join('\n');
}

// ============================================================================
// Generate barrel index.ts
// ============================================================================

function generateIndexFile(
  namespaces: Record<string, Record<string, string>>,
): string {
  const lines: string[] = [];
  lines.push(`import type { MessageBundle } from '@neko/shared';`);
  lines.push('');

  const nsNames = Object.keys(namespaces).sort();
  for (const ns of nsNames) {
    lines.push(`import { ${toIdentifier(ns)} } from './${ns}';`);
  }

  lines.push('');
  lines.push(
    `export const bundles: Record<string, MessageBundle> = {`,
  );
  for (const ns of nsNames) {
    lines.push(`  ${toIdentifier(ns)},`);
  }
  lines.push(`};`);
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Helpers
// ============================================================================

/** JS reserved words that cannot be used as identifiers */
const RESERVED_WORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
  'false', 'finally', 'for', 'function', 'if', 'import', 'in',
  'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this',
  'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with',
  'yield',
]);

function toIdentifier(s: string): string {
  let name = s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  if (RESERVED_WORDS.has(name)) {
    name = `${name}Bundle`;
  }
  return name;
}

/**
 * Parse a TS file that exports a const object.
 * We use a simple dynamic import approach by stripping the type export.
 */
async function loadTranslationObject(
  filePath: string,
): Promise<Record<string, unknown>> {
  const absPath = path.resolve(filePath);
  const content = fs.readFileSync(absPath, 'utf-8');

  // Strip import and type export lines, keep only the const export
  const stripped = content
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export\s+type\s+.*$/gm, '');

  // Write to a temp file for dynamic import
  const tmpPath = absPath.replace(/\.ts$/, '.flatten-tmp.mjs');
  const mjsContent = stripped
    .replace(/export const (\w+):\s*\w+\s*=/, 'export const $1 =')
    .replace(/export const (\w+)\s*=/, 'export const $1 =');

  fs.writeFileSync(tmpPath, mjsContent, 'utf-8');

  try {
    const mod = await import(tmpPath);
    // Find the first exported object
    for (const [, value] of Object.entries(mod)) {
      if (typeof value === 'object' && value !== null) {
        return value as Record<string, unknown>;
      }
    }
    throw new Error(`No exported object found in ${filePath}`);
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error(
      'Usage: npx tsx scripts/flatten-i18n.ts <en.ts> <zh-CN.ts> <output-dir>',
    );
    process.exit(1);
  }

  const [enPath, zhPath, outputDir] = args as [string, string, string];

  console.log('Loading EN translations...');
  const enObj = await loadTranslationObject(enPath);
  const enFlat = flatten(enObj);

  console.log('Loading ZH-CN translations...');
  const zhObj = await loadTranslationObject(zhPath);
  const zhFlat = flatten(zhObj);

  console.log(
    `Flattened: EN=${Object.keys(enFlat).length} keys, ZH=${Object.keys(zhFlat).length} keys`,
  );

  // Split by namespace
  const enNamespaces = splitByNamespace(enFlat);
  const zhNamespaces = splitByNamespace(zhFlat);

  console.log(`Namespaces: ${Object.keys(enNamespaces).join(', ')}`);

  // Write EN files
  const enDir = path.join(outputDir, 'en');
  fs.mkdirSync(enDir, { recursive: true });

  for (const [ns, bundle] of Object.entries(enNamespaces)) {
    const filePath = path.join(enDir, `${ns}.ts`);
    fs.writeFileSync(filePath, generateBundleFile(ns, bundle));
    console.log(`  EN: ${ns}.ts (${Object.keys(bundle).length} keys)`);
  }
  fs.writeFileSync(
    path.join(enDir, 'index.ts'),
    generateIndexFile(enNamespaces),
  );

  // Write ZH-CN files
  const zhDir = path.join(outputDir, 'zh-cn');
  fs.mkdirSync(zhDir, { recursive: true });

  for (const [ns, bundle] of Object.entries(zhNamespaces)) {
    const filePath = path.join(zhDir, `${ns}.ts`);
    fs.writeFileSync(filePath, generateBundleFile(ns, bundle));
    console.log(`  ZH: ${ns}.ts (${Object.keys(bundle).length} keys)`);
  }
  fs.writeFileSync(
    path.join(zhDir, 'index.ts'),
    generateIndexFile(zhNamespaces),
  );

  console.log('\nDone! Files written to:', outputDir);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
