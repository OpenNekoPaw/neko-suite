import { describe, expect, it } from 'vitest';
import { SkillInstallTarget } from '@neko/market-core';
import { SkillInstallTarget as PlatformSkillInstallTarget } from '../index';

describe('platform skill install target', () => {
  it('re-exports the market-core install target as the single implementation', () => {
    expect(PlatformSkillInstallTarget).toBe(SkillInstallTarget);
  });
});
