#!/usr/bin/env node
// =============================================================================
// Proto → TS Code Generator
//
// Parses .proto files from packages/neko-proto/ and generates Engine* types
// for @neko/shared. Uses protobufjs parser for AST extraction, custom codegen
// for TS output.
//
// Usage: node scripts/proto-gen-ts.mjs
// Output: packages/neko-types/src/generated/*.engine.ts
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import protobuf from 'protobufjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PROTO_DIR = resolve(ROOT, 'packages/neko-proto');
const OUT_DIR = resolve(ROOT, 'packages/neko-types/src/generated');

// =============================================================================
// Proto file definitions — each entry describes one .proto → one .engine.ts
// =============================================================================

/** @type {Array<{ proto: string, package: string, output: string, enumRules: Record<string, { prefix: string, style: string }>, keyConstants?: Array<[string, string]> }>} */
const PROTO_FILES = [
  {
    proto: 'timeline.proto',
    package: 'neko.timeline',
    output: 'timeline.engine.ts',
    enumRules: {
      BlendMode:         { prefix: 'BLEND_MODE_',         style: 'camelCase' },
      EasingType:        { prefix: 'EASING_TYPE_',        style: 'kebab-case' },
      TransitionType:    { prefix: 'TRANSITION_TYPE_',    style: 'kebab-case' },
      TrackType:         { prefix: 'TRACK_TYPE_',         style: 'lowerCase' },
      EffectType:        { prefix: 'EFFECT_TYPE_',        style: 'camelCase' },
      InterpolationMode: { prefix: 'INTERPOLATION_MODE_', style: 'lowerCase' },
    },
    keyConstants: [
      ['Element', 'ENGINE_BASE_ELEMENT_KEYS'],
      ['MediaElementData', 'ENGINE_MEDIA_KEYS'],
      ['AudioElementData', 'ENGINE_AUDIO_KEYS'],
      ['TextElementData', 'ENGINE_TEXT_KEYS'],
      ['ShapeElementData', 'ENGINE_SHAPE_KEYS'],
      ['SubtitleElementData', 'ENGINE_SUBTITLE_KEYS'],
      ['Track', 'ENGINE_TRACK_KEYS'],
    ],
  },
  {
    proto: 'diff.proto',
    package: 'neko.diff',
    output: 'diff.engine.ts',
    enumRules: {
      DiffCategory:       { prefix: 'DIFF_CATEGORY_',        style: 'lowerCase' },
      TimelineChangeType: { prefix: 'TIMELINE_CHANGE_TYPE_', style: 'lowerCase' },
    },
    keyConstants: [],
  },
];

// =============================================================================
// Proto type → TS type mapping
// =============================================================================

/** @param {string} protoType @param {Set<string>} knownEnums */
function mapType(protoType, knownEnums) {
  switch (protoType) {
    case 'float': case 'double': case 'int32': case 'int64':
    case 'uint32': case 'uint64': case 'sint32': case 'sint64':
    case 'fixed32': case 'fixed64': case 'sfixed32': case 'sfixed64':
      return 'number';
    case 'string':
      return 'string';
    case 'bool':
      return 'boolean';
    case 'bytes':
      return 'Uint8Array';
    default:
      return `Engine${protoType}`;
  }
}

/** @param {string} protoType */
function isScalarType(protoType) {
  return ['float', 'double', 'int32', 'int64', 'uint32', 'uint64',
    'sint32', 'sint64', 'fixed32', 'fixed64', 'sfixed32', 'sfixed64',
    'string', 'bool', 'bytes'].includes(protoType);
}

// =============================================================================
// snake_case → camelCase conversion
// =============================================================================

/** @param {string} s */
function snakeToCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// =============================================================================
// SCREAMING_SNAKE → target style conversion
// =============================================================================

/**
 * @param {string} value - e.g. 'COLOR_BURN', 'EASE_IN_QUAD', 'VIDEO'
 * @param {'camelCase' | 'kebab-case' | 'lowerCase'} style
 * @returns {string}
 */
function convertEnumValue(value, style) {
  const parts = value.toLowerCase().split('_');
  switch (style) {
    case 'camelCase':
      return parts[0] + parts.slice(1).map(p => p[0].toUpperCase() + p.slice(1)).join('');
    case 'kebab-case':
      return parts.join('-');
    case 'lowerCase':
      return parts.join('');
    default:
      return parts.join('');
  }
}

// =============================================================================
// AST Processing
// =============================================================================

/**
 * Generate TS enum type union from a protobuf Enum.
 * @param {protobuf.Enum} enumObj
 * @param {Record<string, { prefix: string, style: string }>} enumRules
 * @param {Set<string>} knownEnums
 * @returns {{ typeDef: string, name: string } | null}
 */
function generateEnum(enumObj, enumRules, knownEnums) {
  const rule = enumRules[enumObj.name];
  if (!rule) {
    console.warn(`  ⚠ No conversion rule for enum ${enumObj.name}, skipping`);
    return null;
  }

  const tsName = `Engine${enumObj.name}`;
  knownEnums.add(enumObj.name);

  const values = Object.keys(enumObj.values)
    .filter(v => v !== `${rule.prefix}UNSPECIFIED`)
    .map(v => {
      const stripped = v.startsWith(rule.prefix) ? v.slice(rule.prefix.length) : v;
      return `'${convertEnumValue(stripped, rule.style)}'`;
    });

  const typeDef = `export type ${tsName} =\n  | ${values.join('\n  | ')};\n`;
  return { typeDef, name: tsName };
}

/**
 * Determine if a field should be optional in the generated TS interface.
 * @param {protobuf.Field} field
 * @param {Set<string>} knownEnums
 * @returns {boolean}
 */
function isFieldOptional(field, knownEnums) {
  if (field.options?.proto3_optional) return true;
  if (field.repeated) return false;
  if (!isScalarType(field.type) && !knownEnums.has(field.type)) return true;
  return false;
}

/**
 * Generate TS interface from a protobuf Type (message).
 * @param {protobuf.Type} msgType
 * @param {Set<string>} knownEnums
 * @returns {{ interfaceDef: string, name: string, keys: string[] }}
 */
function generateMessage(msgType, knownEnums) {
  const tsName = `Engine${msgType.name}`;
  const lines = [];
  const keys = [];

  const oneofFields = new Set();
  if (msgType.oneofs) {
    for (const oneofName of Object.keys(msgType.oneofs)) {
      if (oneofName.startsWith('_')) continue;
      const oneof = msgType.oneofs[oneofName];
      for (const f of oneof.fieldsArray) {
        oneofFields.add(f.name);
      }
    }
  }

  for (const field of msgType.fieldsArray) {
    if (oneofFields.has(field.name)) continue;

    const camelName = snakeToCamel(field.name);
    const optional = isFieldOptional(field, knownEnums);
    const isRepeated = field.repeated;
    const tsType = mapType(field.type, knownEnums);
    const suffix = isRepeated ? '[]' : '';
    const opt = optional ? '?' : '';

    lines.push(`  ${camelName}${opt}: ${tsType}${suffix};`);
    keys.push(camelName);
  }

  const interfaceDef = `export interface ${tsName} {\n${lines.join('\n')}\n}\n`;
  return { interfaceDef, name: tsName, keys };
}

/**
 * Generate a readonly key array constant.
 * @param {string} constName
 * @param {string[]} keys
 * @returns {string}
 */
function generateKeyConst(constName, keys) {
  const items = keys.map(k => `'${k}'`).join(', ');
  return `export const ${constName} = [${items}] as const;\n`;
}

// =============================================================================
// Process a single proto file
// =============================================================================

/**
 * @param {{ proto: string, package: string, output: string, enumRules: Record<string, { prefix: string, style: string }>, keyConstants?: Array<[string, string]> }} config
 */
function processProto(config) {
  const protoPath = resolve(PROTO_DIR, config.proto);
  const outPath = resolve(OUT_DIR, config.output);

  console.log(`\n--- ${config.proto} ---`);
  console.log(`  Input:  ${protoPath}`);
  console.log(`  Output: ${outPath}`);

  const root = new protobuf.Root();
  const protoContent = readFileSync(protoPath, 'utf-8');
  protobuf.parse(protoContent, root, { keepCase: true });

  const pkg = root.lookup(config.package);
  if (!pkg) {
    console.error(`ERROR: Could not find package ${config.package}`);
    process.exit(1);
  }

  /** @type {Set<string>} */
  const knownEnums = new Set();
  const output = [];

  output.push('// =============================================================================');
  output.push('// AUTO-GENERATED — DO NOT EDIT');
  output.push('//');
  output.push(`// Source: packages/neko-proto/${config.proto}`);
  output.push(`// Generated: ${new Date().toISOString()}`);
  output.push('// Command: node scripts/proto-gen-ts.mjs');
  output.push('// =============================================================================');
  output.push('');

  // --- Enums ---
  output.push('// =============================================================================');
  output.push('// Enums');
  output.push('// =============================================================================');
  output.push('');

  for (const child of pkg.nestedArray) {
    if (child instanceof protobuf.Enum) {
      const result = generateEnum(child, config.enumRules, knownEnums);
      if (result) {
        output.push(result.typeDef);
        console.log(`  ✓ Enum: ${result.name}`);
      }
    }
  }

  // --- Messages ---
  output.push('// =============================================================================');
  output.push('// Messages');
  output.push('// =============================================================================');
  output.push('');

  /** @type {Map<string, string[]>} */
  const messageKeys = new Map();

  for (const child of pkg.nestedArray) {
    if (child instanceof protobuf.Type) {
      const result = generateMessage(child, knownEnums);
      output.push(result.interfaceDef);
      messageKeys.set(child.name, result.keys);
      console.log(`  ✓ Message: ${result.name} (${result.keys.length} fields)`);
    }
  }

  // --- Key constants ---
  if (config.keyConstants && config.keyConstants.length > 0) {
    output.push('// =============================================================================');
    output.push('// Key Constants (for whitelist-based engine field extraction)');
    output.push('// =============================================================================');
    output.push('');

    for (const [msgName, constName] of config.keyConstants) {
      const keys = messageKeys.get(msgName);
      if (keys) {
        output.push(generateKeyConst(constName, keys));
      }
    }
  }

  // --- Write ---
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, output.join('\n') + '\n', 'utf-8');
  console.log(`  ✓ Generated ${outPath}`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('Proto → TS Generator');
  console.log(`  Proto dir: ${PROTO_DIR}`);
  console.log(`  Output dir: ${OUT_DIR}`);

  for (const config of PROTO_FILES) {
    processProto(config);
  }

  console.log(`\n✓ All ${PROTO_FILES.length} proto files processed`);
}

main().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});
