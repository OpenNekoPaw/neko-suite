import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '../../..');
const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as unknown;

function collectLocalizationKeys(value: unknown): string[] {
  if (typeof value === 'string') {
    const match = /^%([^%]+)%$/.exec(value);
    return match?.[1] ? [match[1]] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectLocalizationKeys);
  }

  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(collectLocalizationKeys);
  }

  return [];
}

describe('package manifest localization', () => {
  it.each(['package.nls.json', 'package.nls.zh-cn.json'])(
    'defines every manifest localization key in %s',
    (fileName) => {
      const messages = JSON.parse(readFileSync(resolve(packageRoot, fileName), 'utf8')) as Record<
        string,
        unknown
      >;
      const missingKeys = collectLocalizationKeys(manifest).filter(
        (key) => typeof messages[key] !== 'string',
      );

      expect(missingKeys).toEqual([]);
    },
  );
});
