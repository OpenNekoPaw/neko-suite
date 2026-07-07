import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveCliWorkDir } from '../cli-workdir';

const createdPaths: string[] = [];

afterEach(() => {
  for (const target of createdPaths.splice(0).reverse()) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('resolveCliWorkDir', () => {
  it('resolves explicit cwd to an absolute directory path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-cli-workdir-'));
    createdPaths.push(dir);

    expect(resolveCliWorkDir({ cwd: dir })).toBe(path.resolve(dir));
  });

  it('supports --cd as the Codex-style working directory option', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-cli-workdir-'));
    createdPaths.push(dir);

    expect(resolveCliWorkDir({ cd: dir })).toBe(path.resolve(dir));
  });

  it('supports --work-dir as an alias for --cwd', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-cli-workdir-'));
    createdPaths.push(dir);

    expect(resolveCliWorkDir({ workDir: dir })).toBe(path.resolve(dir));
  });

  it('supports positional workDir for `neko <workDir>`', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-cli-workdir-'));
    createdPaths.push(dir);

    expect(resolveCliWorkDir({ positionalWorkDir: dir })).toBe(path.resolve(dir));
  });

  it('rejects conflicting positional and option working directories', () => {
    const positionalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-cli-workdir-'));
    const optionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-cli-workdir-'));
    createdPaths.push(positionalDir, optionDir);

    expect(() => resolveCliWorkDir({ positionalWorkDir: positionalDir, cwd: optionDir })).toThrow(
      `Conflicting working directories: positional ${path.resolve(
        positionalDir,
      )} differs from option ${path.resolve(optionDir)}`,
    );
  });

  it('rejects conflicting --cwd and --work-dir options', () => {
    const cwdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-cli-workdir-'));
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-cli-workdir-'));
    createdPaths.push(cwdDir, workDir);

    expect(() => resolveCliWorkDir({ cwd: cwdDir, workDir })).toThrow(
      `Conflicting working directories: --cwd ${path.resolve(
        cwdDir,
      )} differs from --work-dir ${path.resolve(workDir)}`,
    );
  });

  it('rejects conflicting --cd and --cwd options', () => {
    const cdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-cli-workdir-'));
    const cwdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-cli-workdir-'));
    createdPaths.push(cdDir, cwdDir);

    expect(() => resolveCliWorkDir({ cd: cdDir, cwd: cwdDir })).toThrow(
      `Conflicting working directories: --cd ${path.resolve(cdDir)} differs from --cwd ${path.resolve(
        cwdDir,
      )}`,
    );
  });

  it('expands a leading home directory marker', () => {
    expect(resolveCliWorkDir({ cwd: '~' })).toBe(os.homedir());
  });

  it('fails visibly when the target is not a directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-cli-workdir-'));
    const filePath = path.join(dir, 'not-dir.txt');
    fs.writeFileSync(filePath, 'x');
    createdPaths.push(dir);

    expect(() => resolveCliWorkDir({ cwd: filePath })).toThrow(
      `Working directory is not a directory: ${filePath}`,
    );
  });

  it('fails visibly when the target does not exist', () => {
    const missingPath = path.join(os.tmpdir(), `neko-missing-${Date.now()}`);

    expect(() => resolveCliWorkDir({ cwd: missingPath })).toThrow(
      `Working directory does not exist: ${missingPath}`,
    );
  });
});
