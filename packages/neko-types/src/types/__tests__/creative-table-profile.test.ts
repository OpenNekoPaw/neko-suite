import { describe, expect, it } from 'vitest';
import {
  STORYBOARD_CREATIVE_TABLE_PROFILE,
  STORYBOARD_CREATIVE_TABLE_RECOMMENDED_HEADERS,
  classifyCreativeTableHeaders,
  getCreativeTableOperationRequirement,
  normalizeCreativeTableHeader,
  resolveCreativeTableField,
} from '../creative-table-profile';

describe('creative table profile descriptor', () => {
  it('resolves localized storyboard aliases to stable field ids', () => {
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, '建议操作')?.id).toBe(
      'nextAction',
    );
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, '来源分格')?.id).toBe(
      'sourcePanel',
    );
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, '视频提示词')?.id).toBe(
      'shotVideoPrompt',
    );
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, '场景视频提示词')?.id).toBe(
      'sceneVideoPrompt',
    );
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, 'custom review')?.id).toBe(
      undefined,
    );
  });

  it('keeps review fields open while classifying known storyboard fields', () => {
    const result = classifyCreativeTableHeaders(STORYBOARD_CREATIVE_TABLE_PROFILE, [
      '场景',
      '镜头',
      '来源',
      '画面',
      '图像提示词',
      '自定义审阅列',
    ]);

    expect(result.matchedProfile).toBe(true);
    expect(result.knownFields.map((field) => field.id)).toEqual([
      'scene',
      'shot',
      'source',
      'visual',
      'imagePrompt',
    ]);
    expect(result.unknownHeaders).toEqual(['自定义审阅列']);
  });

  it('declares prompt slots by scope, media type, and operation', () => {
    const imagePrompt = STORYBOARD_CREATIVE_TABLE_PROFILE.fields.find(
      (field) => field.id === 'imagePrompt',
    );
    const sceneVideoPrompt = STORYBOARD_CREATIVE_TABLE_PROFILE.fields.find(
      (field) => field.id === 'sceneVideoPrompt',
    );

    expect(imagePrompt?.promptSlot).toEqual({
      scope: 'shot',
      mediaType: 'image',
      operation: 'generate',
    });
    expect(sceneVideoPrompt?.promptSlot).toEqual({
      scope: 'scene',
      mediaType: 'video',
      operation: 'generate',
    });
  });

  it('keeps nextAction as plan text and actionId as execution', () => {
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, 'nextAction')?.role).toBe(
      'plan',
    );
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, 'actionId')?.role).toBe(
      'execution',
    );
  });

  it('returns operation-specific requirements only when requested', () => {
    expect(
      getCreativeTableOperationRequirement(
        STORYBOARD_CREATIVE_TABLE_PROFILE,
        'video.scene.generate',
      ),
    ).toEqual({
      operationId: 'video.scene.generate',
      label: 'Generate scene video',
      requiredFieldIds: ['sceneVideoPrompt'],
      acceptedPromptFieldIds: ['sceneVideoPrompt', 'shotVideoPrompt'],
    });
    expect(
      getCreativeTableOperationRequirement(STORYBOARD_CREATIVE_TABLE_PROFILE, 'image.shot.edit')
        ?.requiredFieldIds,
    ).toEqual(['imageEditPrompt']);
  });

  it('normalizes headers consistently with existing storyboard behavior', () => {
    expect(normalizeCreativeTableHeader('Source Panel')).toBe('sourcepanel');
    expect(normalizeCreativeTableHeader('source_panel')).toBe('sourcepanel');
    expect(STORYBOARD_CREATIVE_TABLE_RECOMMENDED_HEADERS).toContain('imagePrompt');
  });
});
