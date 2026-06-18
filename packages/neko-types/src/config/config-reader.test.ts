import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getConfigReadDiagnostic,
  isConfigReadError,
  readConfigFile,
  readConfigFileResult,
} from './config-reader';

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-config-reader-'));
  tempRoots.push(root);
  return root;
}

describe('config-reader typed results', () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns missing without collapsing it into a parse error', () => {
    const filePath = path.join(createTempRoot(), 'missing.json');

    const result = readConfigFileResult(filePath);

    expect(result).toEqual({ status: 'missing', filePath });
    expect(isConfigReadError(result)).toBe(false);
    expect(getConfigReadDiagnostic(result)).toBeUndefined();
    expect(readConfigFile(filePath)).toBeNull();
  });

  it('reports an existing empty file as an error', () => {
    const filePath = path.join(createTempRoot(), 'config.json');
    fs.writeFileSync(filePath, '  \n', 'utf-8');

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('empty');
    expect(isConfigReadError(result)).toBe(true);
    expect(getConfigReadDiagnostic(result)).toEqual(
      expect.objectContaining({
        code: 'empty',
        filePath,
        message: expect.stringContaining(filePath),
      }),
    );
    expect(readConfigFile(filePath)).toBeNull();
  });

  it('reports invalid JSON without returning a config object', () => {
    const filePath = path.join(createTempRoot(), 'config.json');
    fs.writeFileSync(filePath, '{ "providers": [', 'utf-8');

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('invalidJson');
    expect(getConfigReadDiagnostic(result)).toEqual(
      expect.objectContaining({
        code: 'invalidJson',
        filePath,
        detail: expect.any(String),
      }),
    );
    expect(readConfigFile(filePath)).toBeNull();
  });

  it('reports read errors separately from invalid JSON', () => {
    const filePath = path.join(createTempRoot(), 'config-as-directory.json');
    fs.mkdirSync(filePath);

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('readError');
    expect(getConfigReadDiagnostic(result)).toEqual(
      expect.objectContaining({
        code: 'readError',
        filePath,
        detail: expect.any(String),
      }),
    );
    expect(readConfigFile(filePath)).toBeNull();
  });

  it('returns parsed config for valid JSON', () => {
    const filePath = path.join(createTempRoot(), 'config.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        defaultProvider: 'anthropic',
        providers: [{ id: 'anthropic', name: 'anthropic', type: 'anthropic' }],
      }),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      throw new Error('Expected ok result');
    }
    expect(result.config.defaultProvider).toBe('anthropic');
    expect(readConfigFile(filePath)?.defaultProvider).toBe('anthropic');
  });
});
