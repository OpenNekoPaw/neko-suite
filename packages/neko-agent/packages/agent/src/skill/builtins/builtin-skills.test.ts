/**
 * Builtin Skills Tests
 *
 * Tests for builtin skill definitions and structure.
 */

import { describe, it, expect } from 'vitest';
import {
  TOOL_NAMES_TIMELINE,
  TOOL_NAMES_MEDIA,
  TOOL_NAMES_PIPELINE,
  TOOL_NAMES_QUALITY,
  TOOL_NAMES_SYSTEM,
} from '@neko/shared';
import {
  builtinSkills,
  comicToStoryboardSkill,
  scriptGenerationSkill,
  aiGenerateSkill,
  videoEditingSkill,
  storyboardToTimelineSkill,
  qualityAssessmentSkill,
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
      expect(comicToStoryboardSkill.allowedTools).toContain(TOOL_NAMES_MEDIA.GENERATE_VIDEO);
      expect(comicToStoryboardSkill.allowedTools).toContain(TOOL_NAMES_PIPELINE.START_PIPELINE);
      expect(comicToStoryboardSkill.allowedTools).toContain(TOOL_NAMES_MEDIA.GENERATE_TTS);
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
      expect(scriptGenerationSkill.allowedTools).toContain(TOOL_NAMES_SYSTEM.READ);
      expect(scriptGenerationSkill.allowedTools).toContain(TOOL_NAMES_SYSTEM.WRITE);
      expect(scriptGenerationSkill.allowedTools).toContain(TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO);
    });

    it('should have writing icon', () => {
      expect(scriptGenerationSkill.icon).toBe('✍️');
    });

    it('should be enabled', () => {
      expect(scriptGenerationSkill.enabled).toBe(true);
    });
  });

  describe('qualityAssessmentSkill', () => {
    it('should have correct name', () => {
      expect(qualityAssessmentSkill.name).toBe('quality-assessment');
    });

    it('should have description with trigger keywords (en + zh)', () => {
      expect(qualityAssessmentSkill.description).toContain('quality');
      expect(qualityAssessmentSkill.description).toContain('artifacts');
      expect(qualityAssessmentSkill.description).toContain('loudness');
      expect(qualityAssessmentSkill.description).toContain('质量检查');
      expect(qualityAssessmentSkill.description).toContain('音频质量');
    });

    it('should have content with workflow instructions', () => {
      expect(qualityAssessmentSkill.content).toContain('Workflow');
      expect(qualityAssessmentSkill.content).toContain('Evaluate Media');
      expect(qualityAssessmentSkill.content).toContain('Interpret Results');
      expect(qualityAssessmentSkill.content).toContain('Apply Fixes');
    });

    it('should have content with issue categories reference', () => {
      expect(qualityAssessmentSkill.content).toContain('artifact');
      expect(qualityAssessmentSkill.content).toContain('audio-clipping');
      expect(qualityAssessmentSkill.content).toContain('loudness-off');
      expect(qualityAssessmentSkill.content).toContain('prompt-mismatch');
      expect(qualityAssessmentSkill.content).toContain('style-drift');
    });

    it('should have content with remediation tool mapping', () => {
      expect(qualityAssessmentSkill.content).toContain('AddEffect');
      expect(qualityAssessmentSkill.content).toContain('SetColorCorrection');
      expect(qualityAssessmentSkill.content).toContain('SetAudioProperties');
      expect(qualityAssessmentSkill.content).toContain('GenerateImage');
    });

    it('should have QualityCheck as primary tool', () => {
      expect(qualityAssessmentSkill.allowedTools).toContain(TOOL_NAMES_QUALITY.QUALITY_CHECK);
    });

    it('should have regeneration tools for remediation', () => {
      expect(qualityAssessmentSkill.allowedTools).toContain(TOOL_NAMES_MEDIA.GENERATE_IMAGE);
      expect(qualityAssessmentSkill.allowedTools).toContain(TOOL_NAMES_MEDIA.GENERATE_VIDEO);
    });

    it('should have timeline query tools for context', () => {
      expect(qualityAssessmentSkill.allowedTools).toContain(TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO);
      expect(qualityAssessmentSkill.allowedTools).toContain(TOOL_NAMES_TIMELINE.GET_ELEMENT_INFO);
      expect(qualityAssessmentSkill.allowedTools).toContain(
        TOOL_NAMES_TIMELINE.LIST_TIMELINE_ELEMENTS,
      );
    });

    it('should have remediation editing tools enabled', () => {
      expect(qualityAssessmentSkill.allowedTools).toContain(TOOL_NAMES_TIMELINE.ADD_EFFECT);
      expect(qualityAssessmentSkill.allowedTools).toContain(
        TOOL_NAMES_TIMELINE.SET_COLOR_CORRECTION,
      );
      expect(qualityAssessmentSkill.allowedTools).toContain(
        TOOL_NAMES_TIMELINE.SET_AUDIO_PROPERTIES,
      );
    });

    it('should be registered as /quality-check slash command', () => {
      expect(qualityAssessmentSkill.command).toBe('quality-check');
      expect(qualityAssessmentSkill.supportsArguments).toBe(true);
    });

    it('should have quality icon', () => {
      expect(qualityAssessmentSkill.icon).toBe('📊');
    });

    it('should be enabled and builtin', () => {
      expect(qualityAssessmentSkill.enabled).toBe(true);
      expect(qualityAssessmentSkill.source).toBe('builtin');
    });
  });

  describe('skill integration', () => {
    it('should include comicToStoryboardSkill in builtinSkills', () => {
      expect(builtinSkills).toContain(comicToStoryboardSkill);
    });

    it('should include scriptGenerationSkill in builtinSkills', () => {
      expect(builtinSkills).toContain(scriptGenerationSkill);
    });

    it('should include qualityAssessmentSkill in builtinSkills', () => {
      expect(builtinSkills).toContain(qualityAssessmentSkill);
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

      // Quality assessment
      expect(skillNames).toContain('quality-assessment');
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
      expect(storyboardToTimelineSkill.allowedTools).toContain(TOOL_NAMES_PIPELINE.START_PIPELINE);
      expect(comicToStoryboardSkill.allowedTools).toContain(TOOL_NAMES_PIPELINE.START_PIPELINE);
    });

    it('should have pipeline skills with ConfirmPipelineGate tool', () => {
      expect(storyboardToTimelineSkill.allowedTools).toContain(
        TOOL_NAMES_PIPELINE.CONFIRM_PIPELINE_GATE,
      );
      expect(comicToStoryboardSkill.allowedTools).toContain(
        TOOL_NAMES_PIPELINE.CONFIRM_PIPELINE_GATE,
      );
    });
  });

  describe('tool coverage', () => {
    it('should have AI generation tools in ai-generate skill', () => {
      expect(aiGenerateSkill.allowedTools).toContain(TOOL_NAMES_MEDIA.GENERATE_IMAGE);
      expect(aiGenerateSkill.allowedTools).toContain(TOOL_NAMES_MEDIA.GENERATE_VIDEO);
      expect(aiGenerateSkill.allowedTools).toContain(TOOL_NAMES_MEDIA.GENERATE_TTS);
      expect(aiGenerateSkill.allowedTools).toContain(TOOL_NAMES_MEDIA.GENERATE_MUSIC);
    });

    it('should have timeline tools in video-editing skill', () => {
      expect(videoEditingSkill.allowedTools).toContain(TOOL_NAMES_TIMELINE.GET_TIMELINE_INFO);
      expect(videoEditingSkill.allowedTools).toContain(TOOL_NAMES_TIMELINE.ADD_TIMELINE_ELEMENT);
      expect(videoEditingSkill.allowedTools).toContain(TOOL_NAMES_TIMELINE.UPDATE_TIMELINE_ELEMENT);
      expect(videoEditingSkill.allowedTools).toContain(TOOL_NAMES_TIMELINE.DELETE_TIMELINE_ELEMENT);
      expect(videoEditingSkill.allowedTools).toContain(TOOL_NAMES_TIMELINE.GET_ELEMENT_INFO);
      expect(videoEditingSkill.allowedTools).toContain(TOOL_NAMES_TIMELINE.ADD_EFFECT);
      expect(videoEditingSkill.allowedTools).toContain(TOOL_NAMES_TIMELINE.SET_TRANSITION);
      expect(videoEditingSkill.allowedTools).toContain(TOOL_NAMES_TIMELINE.ADD_TRACK);
    });

    it('should have file tools in script-generation skill', () => {
      expect(scriptGenerationSkill.allowedTools).toContain(TOOL_NAMES_SYSTEM.READ);
      expect(scriptGenerationSkill.allowedTools).toContain(TOOL_NAMES_SYSTEM.WRITE);
      expect(scriptGenerationSkill.allowedTools).toContain(TOOL_NAMES_SYSTEM.LIST_DIRECTORY);
    });

    it('should allow AddTrack in scene-to-music skill', () => {
      const skill = builtinSkills.find((item) => item.name === 'scene-to-music');
      expect(skill?.allowedTools).toContain(TOOL_NAMES_TIMELINE.ADD_TRACK);
    });
  });
});
