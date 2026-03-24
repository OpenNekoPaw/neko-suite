import { describe, it, expect } from 'vitest';
import { VersionResolver, parseVersion } from './version-resolver';

describe('parseVersion', () => {
  it('should parse simple versions', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
  });

  it('should parse versions with v prefix', () => {
    expect(parseVersion('v2.0.0')).toEqual({ major: 2, minor: 0, patch: 0, prerelease: [] });
  });

  it('should parse versions with prerelease', () => {
    expect(parseVersion('1.0.0-alpha.1')).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: ['alpha', '1'],
    });
  });

  it('should return undefined for invalid versions', () => {
    expect(parseVersion('invalid')).toBeUndefined();
    expect(parseVersion('1.2')).toBeUndefined();
  });
});

describe('VersionResolver', () => {
  const resolver = new VersionResolver();

  describe('compare', () => {
    it('should compare major versions', () => {
      expect(resolver.compare('2.0.0', '1.0.0')).toBe(1);
      expect(resolver.compare('1.0.0', '2.0.0')).toBe(-1);
    });

    it('should compare minor versions', () => {
      expect(resolver.compare('1.2.0', '1.1.0')).toBe(1);
      expect(resolver.compare('1.0.0', '1.1.0')).toBe(-1);
    });

    it('should compare patch versions', () => {
      expect(resolver.compare('1.0.2', '1.0.1')).toBe(1);
      expect(resolver.compare('1.0.0', '1.0.1')).toBe(-1);
    });

    it('should return 0 for equal versions', () => {
      expect(resolver.compare('1.0.0', '1.0.0')).toBe(0);
    });

    it('should rank release above prerelease', () => {
      expect(resolver.compare('1.0.0', '1.0.0-alpha')).toBe(1);
      expect(resolver.compare('1.0.0-alpha', '1.0.0')).toBe(-1);
    });
  });

  describe('satisfies', () => {
    it('should match exact versions', () => {
      expect(resolver.satisfies('1.2.3', '1.2.3')).toBe(true);
      expect(resolver.satisfies('1.2.3', '1.2.4')).toBe(false);
    });

    it('should match wildcard', () => {
      expect(resolver.satisfies('1.0.0', '*')).toBe(true);
      expect(resolver.satisfies('2.3.4', '')).toBe(true);
      expect(resolver.satisfies('0.1.0', 'x')).toBe(true);
    });

    it('should match caret ranges', () => {
      expect(resolver.satisfies('1.5.0', '^1.2.0')).toBe(true);
      expect(resolver.satisfies('1.2.0', '^1.2.0')).toBe(true);
      expect(resolver.satisfies('2.0.0', '^1.2.0')).toBe(false);
      expect(resolver.satisfies('1.1.0', '^1.2.0')).toBe(false);
    });

    it('should match tilde ranges', () => {
      expect(resolver.satisfies('1.2.5', '~1.2.0')).toBe(true);
      expect(resolver.satisfies('1.2.0', '~1.2.0')).toBe(true);
      expect(resolver.satisfies('1.3.0', '~1.2.0')).toBe(false);
    });

    it('should match comparison operators', () => {
      expect(resolver.satisfies('2.0.0', '>=1.0.0')).toBe(true);
      expect(resolver.satisfies('0.9.0', '>=1.0.0')).toBe(false);
      expect(resolver.satisfies('1.0.0', '>=1.0.0')).toBe(true);
      expect(resolver.satisfies('0.5.0', '<1.0.0')).toBe(true);
      expect(resolver.satisfies('1.0.0', '<1.0.0')).toBe(false);
      expect(resolver.satisfies('1.0.0', '>0.9.0')).toBe(true);
      expect(resolver.satisfies('1.0.0', '<=1.0.0')).toBe(true);
    });

    it('should match AND ranges (space-separated)', () => {
      expect(resolver.satisfies('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
      expect(resolver.satisfies('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
      expect(resolver.satisfies('0.9.0', '>=1.0.0 <2.0.0')).toBe(false);
    });
  });

  describe('maxSatisfying', () => {
    it('should find highest matching version', () => {
      const versions = ['1.0.0', '1.1.0', '1.2.0', '2.0.0'];
      expect(resolver.maxSatisfying(versions, '^1.0.0')).toBe('1.2.0');
    });

    it('should return undefined for no match', () => {
      expect(resolver.maxSatisfying(['1.0.0'], '^2.0.0')).toBeUndefined();
    });

    it('should handle wildcard', () => {
      const versions = ['1.0.0', '2.0.0', '3.0.0'];
      expect(resolver.maxSatisfying(versions, '*')).toBe('3.0.0');
    });
  });

  describe('isCompatible', () => {
    it('should return true when no compatibility is specified', () => {
      expect(resolver.isCompatible(undefined, '1.0.0')).toBe(true);
    });

    it('should check nekoSuiteVersion', () => {
      expect(resolver.isCompatible({ nekoSuiteVersion: '^1.0.0' }, '1.5.0')).toBe(true);
      expect(resolver.isCompatible({ nekoSuiteVersion: '^2.0.0' }, '1.5.0')).toBe(false);
    });

    it('should pass when only vscodeVersion is set', () => {
      expect(resolver.isCompatible({ vscodeVersion: '^1.85.0' }, '1.0.0')).toBe(true);
    });
  });
});
