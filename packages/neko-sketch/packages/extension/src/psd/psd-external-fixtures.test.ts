import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PsdImportIssue, PsdImportIssueCode, PsdLayerNodeWire } from '@neko/shared';
import { parsePsdToWire } from './psd-ag-adapter';

interface PsdFixtureManifest {
  readonly version: 1;
  readonly fixtures: readonly PsdFixtureEntry[];
}

interface PsdFixtureEntry {
  readonly name: string;
  readonly file: string;
  readonly expected: PsdFixtureExpectation;
}

interface PsdFixtureExpectation {
  readonly canvas?: {
    readonly width?: number;
    readonly height?: number;
  };
  readonly topLevelLayerNames?: readonly string[];
  readonly totalLayerCount?: number;
  readonly requiredIssues?: readonly PsdFixtureIssueExpectation[];
  readonly forbiddenIssues?: readonly PsdFixtureIssueExpectation[];
}

interface PsdFixtureIssueExpectation {
  readonly code: PsdImportIssueCode;
  readonly layerPath?: readonly string[];
}

const FIXTURE_ROOT = path.resolve(process.cwd(), '../../test-fixtures/psd');
const MANIFEST_PATH = path.join(FIXTURE_ROOT, 'manifest.json');
const manifest = loadFixtureManifest(MANIFEST_PATH);

describe('PSD external editor fixtures', () => {
  if (manifest.fixtures.length === 0) {
    it.skip('has no external PSD fixtures registered yet', () => undefined);
  }

  for (const fixture of manifest.fixtures) {
    it(`imports ${fixture.name}`, async () => {
      const filePath = resolveFixturePath(fixture.file);
      const result = await parsePsdToWire(path.basename(fixture.file), readFileSync(filePath));

      if (fixture.expected.canvas?.width !== undefined) {
        expect(result.tree.canvas.width).toBe(fixture.expected.canvas.width);
      }
      if (fixture.expected.canvas?.height !== undefined) {
        expect(result.tree.canvas.height).toBe(fixture.expected.canvas.height);
      }
      if (fixture.expected.topLevelLayerNames) {
        expect(result.tree.layers.map((layer) => layer.name)).toEqual(
          fixture.expected.topLevelLayerNames,
        );
      }
      if (fixture.expected.totalLayerCount !== undefined) {
        expect(countLayers(result.tree.layers)).toBe(fixture.expected.totalLayerCount);
      }

      for (const issue of fixture.expected.requiredIssues ?? []) {
        expect(hasIssue(result.issues, issue)).toBe(true);
      }
      for (const issue of fixture.expected.forbiddenIssues ?? []) {
        expect(hasIssue(result.issues, issue)).toBe(false);
      }
    });
  }
});

function loadFixtureManifest(filePath: string): PsdFixtureManifest {
  const parsed = parseJsonFile(filePath);
  if (!isRecord(parsed) || parsed['version'] !== 1 || !Array.isArray(parsed['fixtures'])) {
    throw new Error(`Invalid PSD fixture manifest: ${filePath}`);
  }

  return {
    version: 1,
    fixtures: parsed['fixtures'].map(readFixtureEntry),
  };
}

function readFixtureEntry(value: unknown): PsdFixtureEntry {
  if (!isRecord(value)) {
    throw new Error('Invalid PSD fixture entry: expected object');
  }

  const name = readRequiredString(value, 'name');
  const file = readRequiredString(value, 'file');
  const expected = readExpectation(value['expected']);
  return { name, file, expected };
}

function readExpectation(value: unknown): PsdFixtureExpectation {
  if (!isRecord(value)) {
    throw new Error('Invalid PSD fixture expectation: expected object');
  }

  return {
    canvas: readCanvasExpectation(value['canvas']),
    topLevelLayerNames: readOptionalStringArray(value, 'topLevelLayerNames'),
    totalLayerCount: readOptionalNumber(value, 'totalLayerCount'),
    requiredIssues: readIssueExpectations(value['requiredIssues']),
    forbiddenIssues: readIssueExpectations(value['forbiddenIssues']),
  };
}

function readCanvasExpectation(value: unknown): PsdFixtureExpectation['canvas'] {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error('Invalid PSD fixture canvas expectation: expected object');
  }
  return {
    width: readOptionalNumber(value, 'width'),
    height: readOptionalNumber(value, 'height'),
  };
}

function readIssueExpectations(value: unknown): readonly PsdFixtureIssueExpectation[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error('Invalid PSD fixture issue expectations: expected array');
  }
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new Error('Invalid PSD fixture issue expectation: expected object');
    }
    return {
      code: readRequiredString(item, 'code') as PsdImportIssueCode,
      layerPath: readOptionalStringArray(item, 'layerPath'),
    };
  });
}

function parseJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
}

function resolveFixturePath(relativeFile: string): string {
  const filePath = path.resolve(FIXTURE_ROOT, relativeFile);
  if (!filePath.startsWith(`${FIXTURE_ROOT}${path.sep}`)) {
    throw new Error(`PSD fixture path escapes fixture root: ${relativeFile}`);
  }
  if (!existsSync(filePath)) {
    throw new Error(`PSD fixture file does not exist: ${relativeFile}`);
  }
  return filePath;
}

function countLayers(layers: readonly PsdLayerNodeWire[]): number {
  return layers.reduce((sum, layer) => sum + 1 + countLayers(layer.children ?? []), 0);
}

function hasIssue(
  issues: readonly PsdImportIssue[],
  expected: PsdFixtureIssueExpectation,
): boolean {
  return issues.some(
    (issue) =>
      issue.code === expected.code &&
      (expected.layerPath === undefined || sameLayerPath(issue.layerPath, expected.layerPath)),
  );
}

function sameLayerPath(left: readonly string[] | undefined, right: readonly string[]): boolean {
  if (!left || left.length !== right.length) {
    return false;
  }
  return left.every((part, index) => part === right[index]);
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid PSD fixture manifest: ${key} must be a non-empty string`);
  }
  return value;
}

function readOptionalStringArray(
  record: Record<string, unknown>,
  key: string,
): readonly string[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Invalid PSD fixture manifest: ${key} must be a string array`);
  }
  return value;
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid PSD fixture manifest: ${key} must be a finite number`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
