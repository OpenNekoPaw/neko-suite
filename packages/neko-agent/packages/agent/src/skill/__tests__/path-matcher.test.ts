/**
 * Path Matcher Unit Tests — glob matching for Skill paths trigger
 */

import { describe, it, expect } from 'vitest';
import { matchSkillPaths, globMatch, type SkillPathInfo } from '../path-matcher';

// =============================================================================
// globMatch
// =============================================================================

describe('globMatch', () => {
  it('should match exact paths', () => {
    expect(globMatch('src/index.ts', 'src/index.ts')).toBe(true);
    expect(globMatch('src/index.ts', 'src/other.ts')).toBe(false);
  });

  it('should match * wildcard (single segment)', () => {
    expect(globMatch('src/index.ts', 'src/*.ts')).toBe(true);
    expect(globMatch('src/utils.ts', 'src/*.ts')).toBe(true);
    expect(globMatch('src/deep/index.ts', 'src/*.ts')).toBe(false); // * doesn't cross /
  });

  it('should match ** wildcard (multi-segment)', () => {
    expect(globMatch('src/deep/index.ts', '**/*.ts')).toBe(true);
    expect(globMatch('index.ts', '**/*.ts')).toBe(true);
    expect(globMatch('src/a/b/c/file.ts', 'src/**/*.ts')).toBe(true);
  });

  it('should match ? wildcard (single char)', () => {
    expect(globMatch('src/a.ts', 'src/?.ts')).toBe(true);
    expect(globMatch('src/ab.ts', 'src/?.ts')).toBe(false);
  });

  it('should handle file extensions correctly', () => {
    expect(globMatch('story.fountain', '**/*.fountain')).toBe(true);
    expect(globMatch('scripts/story.fdx', '**/*.fdx')).toBe(true);
    expect(globMatch('story.txt', '**/*.fountain')).toBe(false);
  });

  it('should normalize backslashes', () => {
    expect(globMatch('src\\deep\\file.ts', 'src/**/*.ts')).toBe(true);
  });
});

// =============================================================================
// matchSkillPaths
// =============================================================================

describe('matchSkillPaths', () => {
  it('should return empty array when no skills have paths', () => {
    const skills: SkillPathInfo[] = [{ name: 'general' }, { name: 'other', paths: [] }];

    expect(matchSkillPaths('src/file.ts', skills)).toEqual([]);
  });

  it('should match skills with matching paths', () => {
    const skills: SkillPathInfo[] = [
      { name: 'screenplay', paths: ['**/*.fountain', '**/*.fdx'] },
      { name: 'typescript', paths: ['**/*.ts', '**/*.tsx'] },
      { name: 'rust', paths: ['**/*.rs'] },
    ];

    expect(matchSkillPaths('scripts/story.fountain', skills)).toEqual(['screenplay']);
    expect(matchSkillPaths('src/index.ts', skills)).toEqual(['typescript']);
    expect(matchSkillPaths('engine/main.rs', skills)).toEqual(['rust']);
  });

  it('should return multiple skills when multiple match', () => {
    const skills: SkillPathInfo[] = [
      { name: 'linter', paths: ['**/*.ts'] },
      { name: 'formatter', paths: ['src/**/*.ts'] },
    ];

    const result = matchSkillPaths('src/utils.ts', skills);

    expect(result).toContain('linter');
    expect(result).toContain('formatter');
    expect(result).toHaveLength(2);
  });

  it('should return empty when no patterns match', () => {
    const skills: SkillPathInfo[] = [{ name: 'python', paths: ['**/*.py'] }];

    expect(matchSkillPaths('src/file.ts', skills)).toEqual([]);
  });

  it('should not add same skill twice even if multiple patterns match', () => {
    const skills: SkillPathInfo[] = [{ name: 'media', paths: ['**/*.mp4', '**/*.mp*'] }];

    const result = matchSkillPaths('output/video.mp4', skills);

    expect(result).toEqual(['media']);
  });
});
