/**
 * PathResolver Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PathResolver } from '../../service/PathResolver';

describe('PathResolver', () => {
  let resolver: PathResolver;

  beforeEach(() => {
    resolver = new PathResolver();
    resolver.setVariables(
      new Map([
        ['TEAM_FOOTAGE', '/Volumes/NAS/footage'],
        ['PERSONAL_SFX', '/Users/user/SFX'],
        ['NESTED_LIB', '/Volumes/NAS/footage/premium'],
      ]),
    );
  });

  describe('resolve', () => {
    it('should expand variable to absolute path', () => {
      expect(resolver.resolve('${TEAM_FOOTAGE}/scene01/clip.mp4')).toBe(
        '/Volumes/NAS/footage/scene01/clip.mp4',
      );
    });

    it('should handle variable-only path', () => {
      expect(resolver.resolve('${TEAM_FOOTAGE}')).toBe('/Volumes/NAS/footage');
    });

    it('should return as-is if no variable pattern', () => {
      expect(resolver.resolve('/absolute/path/file.mp4')).toBe('/absolute/path/file.mp4');
    });

    it('should return as-is if variable not defined', () => {
      expect(resolver.resolve('${UNKNOWN_VAR}/file.mp4')).toBe('${UNKNOWN_VAR}/file.mp4');
    });

    it('should handle deeply nested paths', () => {
      expect(resolver.resolve('${PERSONAL_SFX}/impacts/heavy/boom.wav')).toBe(
        '/Users/user/SFX/impacts/heavy/boom.wav',
      );
    });

    it('should not produce double slashes', () => {
      resolver.setVariables(new Map([['WITH_SLASH', '/path/with/trailing/']]));
      expect(resolver.resolve('${WITH_SLASH}/file.mp4')).toBe('/path/with/trailing/file.mp4');
    });
  });

  describe('contract', () => {
    it('should contract absolute path to variable path', () => {
      expect(resolver.contract('/Volumes/NAS/footage/scene01/clip.mp4')).toBe(
        '${TEAM_FOOTAGE}/scene01/clip.mp4',
      );
    });

    it('should pick longest matching variable (most specific)', () => {
      // /Volumes/NAS/footage/premium/x.mp4 should match NESTED_LIB, not TEAM_FOOTAGE
      expect(resolver.contract('/Volumes/NAS/footage/premium/clip.mp4')).toBe(
        '${NESTED_LIB}/clip.mp4',
      );
    });

    it('should return as-is if no variable matches', () => {
      expect(resolver.contract('/other/path/file.mp4')).toBe('/other/path/file.mp4');
    });

    it('should handle exact match (path equals variable base)', () => {
      expect(resolver.contract('/Users/user/SFX')).toBe('${PERSONAL_SFX}');
    });

    it('should not produce leading slash in rest', () => {
      const result = resolver.contract('/Volumes/NAS/footage/clip.mp4');
      expect(result).toBe('${TEAM_FOOTAGE}/clip.mp4');
      expect(result).not.toContain('//');
    });
  });

  describe('round-trip', () => {
    it('should round-trip: contract then resolve returns original', () => {
      const original = '/Volumes/NAS/footage/scene01/clip.mp4';
      const contracted = resolver.contract(original);
      const resolved = resolver.resolve(contracted);
      expect(resolved).toBe(original);
    });

    it('should round-trip with nested variable', () => {
      const original = '/Volumes/NAS/footage/premium/pack01/sound.wav';
      const contracted = resolver.contract(original);
      expect(contracted).toBe('${NESTED_LIB}/pack01/sound.wav');
      expect(resolver.resolve(contracted)).toBe(original);
    });
  });

  describe('hasVariable', () => {
    it('should return true for variable paths', () => {
      expect(resolver.hasVariable('${TEAM_FOOTAGE}/clip.mp4')).toBe(true);
    });

    it('should return false for absolute paths', () => {
      expect(resolver.hasVariable('/absolute/path/file.mp4')).toBe(false);
    });

    it('should return false for variable-like but not at start', () => {
      expect(resolver.hasVariable('prefix/${VAR}/file.mp4')).toBe(false);
    });
  });

  describe('setVariables', () => {
    it('should update variables', () => {
      resolver.setVariables(new Map([['NEW_VAR', '/new/path']]));

      expect(resolver.resolve('${NEW_VAR}/file.mp4')).toBe('/new/path/file.mp4');
      // Old variables no longer resolve
      expect(resolver.resolve('${TEAM_FOOTAGE}/file.mp4')).toBe('${TEAM_FOOTAGE}/file.mp4');
    });

    it('should not share reference with input map', () => {
      const input = new Map([['VAR', '/path']]);
      resolver.setVariables(input);
      input.set('VAR', '/changed');
      expect(resolver.resolve('${VAR}/file.mp4')).toBe('/path/file.mp4');
    });
  });

  describe('getVariables', () => {
    it('should return a copy of variables', () => {
      const vars = resolver.getVariables();
      expect(vars.get('TEAM_FOOTAGE')).toBe('/Volumes/NAS/footage');
      // Modifying returned map should not affect resolver
      vars.set('TEAM_FOOTAGE', '/changed');
      expect(resolver.resolve('${TEAM_FOOTAGE}/file.mp4')).toBe('/Volumes/NAS/footage/file.mp4');
    });
  });
});
