import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeHash, verifyIntegrity } from './integrity-checker';

const testDir = join(tmpdir(), 'neko-market-integrity-test');
const testFile = join(testDir, 'test.txt');
const testContent = 'Hello, Neko Market!';

beforeAll(async () => {
  await mkdir(testDir, { recursive: true });
  await writeFile(testFile, testContent, 'utf-8');
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('computeHash', () => {
  it('should compute sha256 hash', async () => {
    const hash = await computeHash(testFile, 'sha256');
    expect(hash).toMatch(/^sha256-.+/);
  });

  it('should compute sha384 hash', async () => {
    const hash = await computeHash(testFile, 'sha384');
    expect(hash).toMatch(/^sha384-.+/);
  });

  it('should compute sha512 hash', async () => {
    const hash = await computeHash(testFile, 'sha512');
    expect(hash).toMatch(/^sha512-.+/);
  });

  it('should default to sha256', async () => {
    const hash = await computeHash(testFile);
    expect(hash).toMatch(/^sha256-.+/);
  });

  it('should produce deterministic results', async () => {
    const hash1 = await computeHash(testFile);
    const hash2 = await computeHash(testFile);
    expect(hash1).toBe(hash2);
  });
});

describe('verifyIntegrity', () => {
  it('should verify correct hash', async () => {
    const hash = await computeHash(testFile);
    expect(await verifyIntegrity(testFile, hash)).toBe(true);
  });

  it('should reject incorrect hash', async () => {
    expect(await verifyIntegrity(testFile, 'sha256-AAAA')).toBe(false);
  });

  it('should reject invalid format', async () => {
    expect(await verifyIntegrity(testFile, 'invalid')).toBe(false);
  });

  it('should reject unsupported algorithm', async () => {
    expect(await verifyIntegrity(testFile, 'md5-AAAA')).toBe(false);
  });
});
