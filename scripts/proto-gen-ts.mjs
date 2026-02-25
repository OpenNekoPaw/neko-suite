#!/usr/bin/env node
// =============================================================================
// Proto → TS Code Generator
//
// Parses proto/timeline.proto and generates Engine* types for @neko/shared.
// Uses protobufjs parser for AST extraction, custom codegen for TS output.
//
// Usage: node scripts/proto-gen-ts.mjs
// Output: packages/neko-types/src/generated/timeline.engine.ts
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import protobuf from 'protobufjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PROTO_PATH = resolve(ROOT, 'proto/timeline.proto');
const OUT_PATH = resolve(ROOT, 'packages/neko-types/src/generated/timeline.engine.ts');

// =============================================================================
// Enum value conversion rules (per-enum)
// =============================================================================

/** @type {Record<string, { prefix: string, style: 'camelCase' | 'kebab-case' | 'lowerCase' }>} */
const ENUM_RULES = {
  BlendMode:         { prefix: 'BLEND_MODE_',         style: 'camelCase' },
  EasingType:        { prefix: 'EASING_TYPE_',        style: 'kebab-case' },
  TransitionType:    { prefix: 'TRANSITION_TYPE_',    style: 'kebab-case' },
  TrackType:         { prefix: 'TRACK_TYPE_',         style: 'lowerCase' },
  EffectType:        { prefix: 'EFFECT_TYPE_',        style: 'camelCase' },
  InterpolationMode: { prefix: 'INTERPOLATION_MODE_', style: 'lowerCase' },
};

// =============================================================================
// Set of all known enum type names (populated during generation)
// =============================================================================

/** @type {Set<string>} */
const knownEnums = new Set();

// =============================================================================
// Proto type → TS type mapping
// =============================================================================

/** @param {string} protoType */
function mapType(protoType) {
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

/**
 * Check if a proto type is a scalar (has a default zero-value in proto3).
 * @param {string} protoType
 */
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
 * @returns {{ typeDef: string, name: string } | null}
 */
function generateEnum(enumObj) {
  const rule = ENUM_RULES[enumObj.name];
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
 *
 * In proto3:
 * - Regular scalar/enum fields always have a default value (not nullable) → required
 * - Fields with explicit `optional` keyword → proto3_optional option → TS optional
 * - Message-typed fields are always nullable in proto3 → TS optional
 * - Repeated fields always have a default (empty array) → required
 *
 * @param {protobuf.Field} field
 * @returns {boolean}
 */
function isFieldOptional(field) {
  // Explicitly marked optional in proto
  if (field.options?.proto3_optional) return true;
  // Repeated fields are never optional (default: empty array)
  if (field.repeated) return false;
  // Message-typed fields (non-scalar, non-enum) are optional in proto3
  if (!isScalarType(field.type) && !knownEnums.has(field.type)) return true;
  // Regular proto3 scalar/enum fields are required (have default values)
  return false;
}

/**
 * Generate TS interface from a protobuf Type (message).
 * @param {protobuf.Type} msgType
 * @returns {{ interfaceDef: string, name: string, keys: string[] }}
 */
function generateMessage(msgType) {
  const tsName = `Engine${msgType.name}`;
  const lines = [];
  const keys = [];

  // Collect oneof field names to skip.
  // protobufjs wraps `optional` keyword fields in synthetic oneofs named `_fieldName`.
  // Only skip fields from REAL oneofs (no `_` prefix); synthetic oneofs are just optional fields.
  const oneofFields = new Set();
  if (msgType.oneofs) {
    for (const oneofName of Object.keys(msgType.oneofs)) {
      // Synthetic oneofs from proto3 `optional` keyword start with '_'
      if (oneofName.startsWith('_')) continue;
      const oneof = msgType.oneofs[oneofName];
      for (const f of oneof.fieldsArray) {
        oneofFields.add(f.name);
      }
    }
  }

  for (const field of msgType.fieldsArray) {
    // Skip oneof variant fields (TS side uses discriminated union)
    if (oneofFields.has(field.name)) continue;

    const camelName = snakeToCamel(field.name);
    const optional = isFieldOptional(field);
    const isRepeated = field.repeated;
    const tsType = mapType(field.type);
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
// Main
// =============================================================================

async function main() {
  console.log('Proto → TS Generator');
  console.log(`  Input:  ${PROTO_PATH}`);
  console.log(`  Output: ${OUT_PATH}`);

  const root = new protobuf.Root();
  const protoContent = readFileSync(PROTO_PATH, 'utf-8');
  protobuf.parse(protoContent, root, { keepCase: true });

  const pkg = root.lookup('neko.timeline');
  if (!pkg) {
    console.error('ERROR: Could not find package neko.timeline');
    process.exit(1);
  }

  const output = [];
  output.push('// =============================================================================');
  output.push('// AUTO-GENERATED — DO NOT EDIT');
  output.push('//');
  output.push('// Source: proto/timeline.proto');
  output.push(`// Generated: ${new Date().toISOString()}`);
  output.push('// Command: node scripts/proto-gen-ts.mjs');
  output.push('// =============================================================================');
  output.push('');

  // --- Enums (must come first so knownEnums is populated for message generation) ---
  output.push('// =============================================================================');
  output.push('// Enums');
  output.push('// =============================================================================');
  output.push('');

  for (const child of pkg.nestedArray) {
    if (child instanceof protobuf.Enum) {
      const result = generateEnum(child);
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
      const result = generateMessage(child);
      output.push(result.interfaceDef);
      messageKeys.set(child.name, result.keys);
      console.log(`  ✓ Message: ${result.name} (${result.keys.length} fields)`);
    }
  }

  // --- Key constants ---
  output.push('// =============================================================================');
  output.push('// Key Constants (for whitelist-based engine field extraction)');
  output.push('// =============================================================================');
  output.push('');

  const elementKeys = messageKeys.get('Element');
  if (elementKeys) {
    output.push(generateKeyConst('ENGINE_BASE_ELEMENT_KEYS', elementKeys));
  }

  const elementDataMessages = [
    ['MediaElementData', 'ENGINE_MEDIA_KEYS'],
    ['AudioElementData', 'ENGINE_AUDIO_KEYS'],
    ['TextElementData', 'ENGINE_TEXT_KEYS'],
    ['ShapeElementData', 'ENGINE_SHAPE_KEYS'],
    ['SubtitleElementData', 'ENGINE_SUBTITLE_KEYS'],
  ];

  for (const [msgName, constName] of elementDataMessages) {
    const keys = messageKeys.get(msgName);
    if (keys) {
      output.push(generateKeyConst(constName, keys));
    }
  }

  const trackKeys = messageKeys.get('Track');
  if (trackKeys) {
    output.push(generateKeyConst('ENGINE_TRACK_KEYS', trackKeys));
  }

  // --- Write ---
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, output.join('\n') + '\n', 'utf-8');
  console.log(`\n✓ Generated ${OUT_PATH}`);
}

main().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});
