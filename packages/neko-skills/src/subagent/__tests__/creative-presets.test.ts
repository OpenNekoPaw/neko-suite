/**
 * Creative Presets Tests — domain-specific SubAgent configurations
 */

import { describe, it, expect } from 'vitest';
import {
  CREATIVE_PRESETS,
  getCreativeAgentTypes,
  getCreativePresets,
  isCreativeAgentType,
} from '../creative-presets';
import type { SubAgentPresetToolPolicy } from '../creative-presets';

// =============================================================================
// Tests
// =============================================================================

describe('CREATIVE_PRESETS', () => {
  it('should have all 6 creative agent types', () => {
    expect(Object.keys(CREATIVE_PRESETS)).toHaveLength(6);
    expect(CREATIVE_PRESETS['creative-director']).toBeDefined();
    expect(CREATIVE_PRESETS.cinematographer).toBeDefined();
    expect(CREATIVE_PRESETS.composer).toBeDefined();
    expect(CREATIVE_PRESETS.editor).toBeDefined();
    expect(CREATIVE_PRESETS['vfx-artist']).toBeDefined();
    expect(CREATIVE_PRESETS['quality-checker']).toBeDefined();
  });

  it('should have valid preset configurations', () => {
    for (const [type, preset] of Object.entries(CREATIVE_PRESETS)) {
      expect(preset.description, `${type} missing description`).toBeTruthy();
      expect(preset.systemPrompt, `${type} missing systemPrompt`).toBeTruthy();
      expect(preset.toolPolicy.kind, `${type} invalid tool policy`).toBe('allow-list');
      expect(
        getAllowListTools(preset.toolPolicy).length,
        `${type} has no allowed tools`,
      ).toBeGreaterThan(0);
      expect(['fast', 'balanced', 'powerful'], `${type} invalid modelTier`).toContain(
        preset.defaultModelTier,
      );
      expect(preset.defaultMaxIterations, `${type} maxIterations`).toBeGreaterThan(0);
    }
  });

  it('creative-director should use powerful model tier', () => {
    expect(CREATIVE_PRESETS['creative-director'].defaultModelTier).toBe('powerful');
  });

  it('editor should have timeline tools', () => {
    const editorTools = getAllowListTools(CREATIVE_PRESETS.editor.toolPolicy);
    expect(editorTools).toContain('GetTimelineInfo');
    expect(editorTools).toContain('AddClip');
    expect(editorTools).toContain('AddTransition');
  });

  it('composer should have audio generation tools', () => {
    const composerTools = getAllowListTools(CREATIVE_PRESETS.composer.toolPolicy);
    expect(composerTools).toContain('GenerateAudio');
    expect(composerTools).toContain('GenerateMusic');
    expect(composerTools).toContain('SynthesizeSpeech');
  });

  it('exposes only the canonical QualityCheck tool to the quality checker', () => {
    const qualityTools = getAllowListTools(CREATIVE_PRESETS['quality-checker'].toolPolicy);

    expect(qualityTools).toEqual(['QualityCheck']);
    expect(CREATIVE_PRESETS['quality-checker'].systemPrompt).not.toContain(
      'QualityCheckConsistency',
    );
    expect(getCreativePresets({ locale: 'zh-CN' })['quality-checker'].systemPrompt).not.toContain(
      'QualityCheckConsistency',
    );
  });

  it('all presets except quality-checker should include GetContext tool', () => {
    for (const [type, preset] of Object.entries(CREATIVE_PRESETS)) {
      if (type === 'quality-checker') continue;
      expect(getAllowListTools(preset.toolPolicy), `${type} missing GetContext`).toContain(
        'GetContext',
      );
    }
  });

  it('projects Chinese creative SubAgent presets without changing routing contracts', () => {
    const presets = getCreativePresets({ locale: 'zh-CN' });

    expect(presets['creative-director'].systemPrompt).toContain('你是专注视觉叙事');
    expect(presets.editor.systemPrompt).toContain('专业视频剪辑师');
    expect(presets['quality-checker'].systemPrompt).toContain('媒体质量评估专家');
    expect(presets['creative-director'].systemPrompt).not.toContain('You are a creative director');
    expect(presets.editor.toolPolicy).toEqual(CREATIVE_PRESETS.editor.toolPolicy);
    expect(presets.editor.defaultModelTier).toBe(CREATIVE_PRESETS.editor.defaultModelTier);
  });
});

function getAllowListTools(policy: SubAgentPresetToolPolicy): readonly string[] {
  if (policy.kind !== 'allow-list') {
    throw new Error(`Expected allow-list policy, got ${policy.kind}`);
  }

  return policy.tools;
}

describe('isCreativeAgentType', () => {
  it('should return true for creative types', () => {
    expect(isCreativeAgentType('creative-director')).toBe(true);
    expect(isCreativeAgentType('cinematographer')).toBe(true);
    expect(isCreativeAgentType('composer')).toBe(true);
    expect(isCreativeAgentType('editor')).toBe(true);
    expect(isCreativeAgentType('vfx-artist')).toBe(true);
  });

  it('should return false for non-creative types', () => {
    expect(isCreativeAgentType('general')).toBe(false);
    expect(isCreativeAgentType('code-search')).toBe(false);
    expect(isCreativeAgentType('unknown')).toBe(false);
  });
});

describe('getCreativeAgentTypes', () => {
  it('should return all 6 types', () => {
    const types = getCreativeAgentTypes();
    expect(types).toHaveLength(6);
    expect(types).toContain('creative-director');
    expect(types).toContain('vfx-artist');
    expect(types).toContain('quality-checker');
  });
});
