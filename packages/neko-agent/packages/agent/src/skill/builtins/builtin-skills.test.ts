/**
 * Builtin Skills Tests
 *
 * Tests for builtin skill definitions and structure.
 */

import { describe, it, expect } from 'vitest';
import {
  builtinSkills,
  comicToStoryboardSkill,
  scriptGenerationSkill,
  aiGenerateSkill,
  videoEditingSkill,
  storyboardToTimelineSkill,
} from '../index';

describe('Builtin Skills', () => {
  describe('builtinSkills array', () => {
    it('should contain all builtin skills', () => {
      expect(builtinSkills.length).toBeGreaterThanOrEqual(10);
    });

    it('should have unique skill names', () => {
      const names = builtinSkills.map((s) => s.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should have all skills enabled by default', () => {
      const allEnabled = builtinSkills.every((s) => s.enabled === true);
      expect(allEnabled).toBe(true);
    });

    it('should have all skills marked as builtin source', () => {
      const allBuiltin = builtinSkills.every((s) => s.source === 'builtin');
      expect(allBuiltin).toBe(true);
    });

    it('should have valid icons for all skills', () => {
      const allHaveIcons = builtinSkills.every((s) => s.icon && s.icon.length > 0);
      expect(allHaveIcons).toBe(true);
    });
  });

  describe('comicToStoryboardSkill', () => {
    it('should have correct name', () => {
      expect(comicToStoryboardSkill.name).toBe('comic-to-storyboard');
    });

    it('should have description with trigger keywords', () => {
      expect(comicToStoryboardSkill.description).toContain('comic');
      expect(comicToStoryboardSkill.description).toContain('manga');
      expect(comicToStoryboardSkill.description).toContain('漫画');
    });

    it('should have content with workflow instructions', () => {
      expect(comicToStoryboardSkill.content).toContain('Comic Analysis');
      expect(comicToStoryboardSkill.content).toContain('Panel');
      expect(comicToStoryboardSkill.content).toContain('OCR');
    });

    it('should have required tools', () => {
      expect(comicToStoryboardSkill.allowedTools).toContain('GenerateCharacter');
      expect(comicToStoryboardSkill.allowedTools).toContain('GenerateVideo');
      expect(comicToStoryboardSkill.allowedTools).toContain('StartPipeline');
      expect(comicToStoryboardSkill.allowedTools).toContain('GenerateTTS');
    });

    it('should have flowE pipeline ID', () => {
      expect(comicToStoryboardSkill.pipelineFlowId).toBe('flowE');
    });

    it('should have comic icon', () => {
      expect(comicToStoryboardSkill.icon).toBe('📚');
    });

    it('should be enabled', () => {
      expect(comicToStoryboardSkill.enabled).toBe(true);
    });
  });

  describe('scriptGenerationSkill', () => {
    it('should have correct name', () => {
      expect(scriptGenerationSkill.name).toBe('script-generation');
    });

    it('should have description with trigger keywords', () => {
      expect(scriptGenerationSkill.description).toContain('script');
      expect(scriptGenerationSkill.description).toContain('screenplay');
      expect(scriptGenerationSkill.description).toContain('写剧本');
    });

    it('should have content with genre templates', () => {
      expect(scriptGenerationSkill.content).toContain('Genre Templates');
      expect(scriptGenerationSkill.content).toContain('Short Film');
      expect(scriptGenerationSkill.content).toContain('Commercial');
      expect(scriptGenerationSkill.content).toContain('Music Video');
      expect(scriptGenerationSkill.content).toContain('Tutorial');
    });

    it('should have content with Fountain format instructions', () => {
      expect(scriptGenerationSkill.content).toContain('Fountain');
      expect(scriptGenerationSkill.content).toContain('INT./EXT.');
      expect(scriptGenerationSkill.content).toContain('Scene heading');
    });

    it('should have content with character arc templates', () => {
      expect(scriptGenerationSkill.content).toContain('Character Arc');
      expect(scriptGenerationSkill.content).toContain('Positive Arc');
      expect(scriptGenerationSkill.content).toContain('Flat Arc');
      expect(scriptGenerationSkill.content).toContain('Negative Arc');
    });

    it('should have required tools', () => {
      expect(scriptGenerationSkill.allowedTools).toContain('Read');
      expect(scriptGenerationSkill.allowedTools).toContain('Write');
      expect(scriptGenerationSkill.allowedTools).toContain('GetTimelineInfo');
    });

    it('should have writing icon', () => {
      expect(scriptGenerationSkill.icon).toBe('✍️');
    });

    it('should be enabled', () => {
      expect(scriptGenerationSkill.enabled).toBe(true);
    });
  });

  describe('skill integration', () => {
    it('should include comicToStoryboardSkill in builtinSkills', () => {
      expect(builtinSkills).toContain(comicToStoryboardSkill);
    });

    it('should include scriptGenerationSkill in builtinSkills', () => {
      expect(builtinSkills).toContain(scriptGenerationSkill);
    });

    it('should have complementary skills for full workflow', () => {
      const skillNames = builtinSkills.map((s) => s.name);

      // Script creation workflow
      expect(skillNames).toContain('script-generation');
      expect(skillNames).toContain('script-to-timeline');

      // Comic workflow
      expect(skillNames).toContain('comic-to-storyboard');

      // Pipeline orchestration
      expect(skillNames).toContain('storyboard-to-timeline');
      expect(skillNames).toContain('pipeline-retry');

      // AI generation
      expect(skillNames).toContain('ai-generate');

      // Video editing
      expect(skillNames).toContain('video-editing');
      expect(skillNames).toContain('color-grading');
      expect(skillNames).toContain('audio-mixing');
      expect(skillNames).toContain('subtitle-assistant');
    });
  });

  describe('skill content structure', () => {
    it('should have markdown formatted content', () => {
      // Check that content uses markdown headers
      expect(comicToStoryboardSkill.content).toMatch(/^#/m);
      expect(scriptGenerationSkill.content).toMatch(/^#/m);
    });

    it('should have workflow sections', () => {
      expect(comicToStoryboardSkill.content).toContain('Workflow');
      expect(scriptGenerationSkill.content).toContain('Workflow');
    });

    it('should have examples or templates', () => {
      expect(comicToStoryboardSkill.content).toContain('Example');
      expect(scriptGenerationSkill.content).toContain('Template');
    });
  });

  describe('pipeline integration', () => {
    it('should have storyboard-to-timeline with flowF', () => {
      expect(storyboardToTimelineSkill.pipelineFlowId).toBe('flowF');
    });

    it('should have comic-to-storyboard with flowE', () => {
      expect(comicToStoryboardSkill.pipelineFlowId).toBe('flowE');
    });

    it('should have pipeline skills with StartPipeline tool', () => {
      expect(storyboardToTimelineSkill.allowedTools).toContain('StartPipeline');
      expect(comicToStoryboardSkill.allowedTools).toContain('StartPipeline');
    });

    it('should have pipeline skills with ConfirmPipelineGate tool', () => {
      expect(storyboardToTimelineSkill.allowedTools).toContain('ConfirmPipelineGate');
      expect(comicToStoryboardSkill.allowedTools).toContain('ConfirmPipelineGate');
    });
  });

  describe('tool coverage', () => {
    it('should have AI generation tools in ai-generate skill', () => {
      expect(aiGenerateSkill.allowedTools).toContain('GenerateImage');
      expect(aiGenerateSkill.allowedTools).toContain('GenerateVideo');
      expect(aiGenerateSkill.allowedTools).toContain('GenerateTTS');
      expect(aiGenerateSkill.allowedTools).toContain('GenerateMusic');
    });

    it('should have timeline tools in video-editing skill', () => {
      expect(videoEditingSkill.allowedTools).toContain('GetTimelineInfo');
      expect(videoEditingSkill.allowedTools).toContain('AddElement');
      expect(videoEditingSkill.allowedTools).toContain('UpdateElement');
      expect(videoEditingSkill.allowedTools).toContain('TrimElement');
    });

    it('should have file tools in script-generation skill', () => {
      expect(scriptGenerationSkill.allowedTools).toContain('Read');
      expect(scriptGenerationSkill.allowedTools).toContain('Write');
      expect(scriptGenerationSkill.allowedTools).toContain('ListDirectory');
    });
  });
});
