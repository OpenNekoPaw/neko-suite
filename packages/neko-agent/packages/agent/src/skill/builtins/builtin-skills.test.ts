/**
 * Builtin Skills Tests
 *
 * Tests for builtin skill definitions and structure.
 */

import { describe, it, expect } from 'vitest';
import {
  TOOL_NAMES_CANVAS,
  TOOL_NAMES_TIMELINE,
  TOOL_NAMES_MEDIA,
  TOOL_NAMES_QUALITY,
  TOOL_NAMES_SYSTEM,
} from '@neko/shared';
import {
  builtinSkills,
  comicToStoryboardSkill,
  getBuiltinSkills,
  getComicToStoryboardSkill,
  scriptGenerationSkill,
  aiGenerateSkill,
  videoEditingSkill,
  qualityAssessmentSkill,
  normalizeBuiltinSkillLocale,
} from '../index';
import {
  animationPlanToCutSkill,
  comicToAnimationSkill,
  exportVideoPackageSkill,
  getMediaToVideoSkill,
  generatedShotAssemblySkill,
  imageToShotSkill,
  mediaToVideoSkill,
  storyboardToAnimationPlanSkill,
} from './media-to-video';

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

    it('should request artifact-backed StoryboardTable semantic output without fake media claims', () => {
      expect(comicToStoryboardSkill.content).toContain('CompositeArtifact');
      expect(comicToStoryboardSkill.content).toContain('StoryboardTable');
      expect(comicToStoryboardSkill.content).toContain('structured payload');
      expect(comicToStoryboardSkill.content).toContain('"schemaVersion": 1');
      expect(comicToStoryboardSkill.content).toContain('"kind": "composite-artifact"');
      expect(comicToStoryboardSkill.content).toContain('"profile": "comic-to-animation-plan"');
      expect(comicToStoryboardSkill.content).toContain('"kind": "domain"');
      expect(comicToStoryboardSkill.content).toContain('"domainKind": "StoryboardTable"');
      expect(comicToStoryboardSkill.content).toContain('"payload"');
      expect(comicToStoryboardSkill.content).toContain('"kind": "storyboard-table"');
      expect(comicToStoryboardSkill.content).toContain('imageStrategy');
      expect(comicToStoryboardSkill.content).toContain('generatedMediaRefs');
      expect(comicToStoryboardSkill.content).toContain('build an image index and panel mapping');
      expect(comicToStoryboardSkill.content).toContain('sourceMediaRefs');
      expect(comicToStoryboardSkill.content).toContain(
        'only reference images from the image index',
      );
      expect(comicToStoryboardSkill.content).toContain('Do not invent image ids');
      expect(comicToStoryboardSkill.content).toContain(
        'Do not ask the user to copy or edit the JSON',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'Do not claim images have already been generated',
      );
      expect(comicToStoryboardSkill.content).toContain('Do not embed base64 image data');
      expect(comicToStoryboardSkill.content).toContain(
        'Do not report Canvas success from this skill unless an actual Canvas tool result exists',
      );
      expect(comicToStoryboardSkill.content).toContain('script-breakdown');
      expect(comicToStoryboardSkill.content).toContain('manga-to-video');
      expect(comicToStoryboardSkill.content).toContain('image-sequence');
      expect(comicToStoryboardSkill.content).toContain('ad-storyboard');
      expect(comicToStoryboardSkill.content).toContain('short-video');
      expect(comicToStoryboardSkill.content).toContain('character-design');
      expect(comicToStoryboardSkill.content).toContain('Profile Composition Guidance');
      expect(comicToStoryboardSkill.content).toContain('composable field groups');
      expect(comicToStoryboardSkill.content).toContain('smallest field set needed');
      expect(comicToStoryboardSkill.content).toContain('do not grant Canvas, Cut');
      expect(comicToStoryboardSkill.content).toContain('Progressive Character Memory');
      expect(comicToStoryboardSkill.content).toContain('textCues');
      expect(comicToStoryboardSkill.content).toContain('OCR/text fragment');
      expect(comicToStoryboardSkill.content).toContain('`dialogue`');
      expect(comicToStoryboardSkill.content).toContain('`narration`');
      expect(comicToStoryboardSkill.content).toContain('`backgroundText`');
      expect(comicToStoryboardSkill.content).toContain('Do not put narration, caption boxes');
      expect(comicToStoryboardSkill.content).toContain('speaker binding');
      expect(comicToStoryboardSkill.content).toContain('voiceCues');
      expect(comicToStoryboardSkill.content).toContain('character-memory-review');
      expect(comicToStoryboardSkill.content).toContain('neko.entityMemoryContributionPayload');
      expect(comicToStoryboardSkill.content).toContain('EntityMemoryContribution');
      expect(comicToStoryboardSkill.content).toContain(
        'emit only dimensions supported by direct source evidence',
      );
      expect(comicToStoryboardSkill.content).toContain('Do not invent `voiceAssetId`');
    });

    it('should group storyboard shots into coarser scenes', () => {
      expect(comicToStoryboardSkill.content).toContain('Scene/shot granularity is important');
      expect(comicToStoryboardSkill.content).toContain('Do not create one scene per shot');
      expect(comicToStoryboardSkill.content).toContain('group multiple panels');
      expect(comicToStoryboardSkill.content).toContain('from the same page or continuous action');
      expect(comicToStoryboardSkill.content).toContain('shotNumber');
    });

    it('should avoid duplicate vision reads for the same comic image batch', () => {
      expect(comicToStoryboardSkill.content).toContain(
        'Choose exactly one vision analysis tool for the same page/batch',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'use ReadImage with mode="vision" when ReadDocument already returned',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'Do not call ReadDocumentImage after ReadImage',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'do not call ReadDocumentImage just because',
      );
    });

    it('should have required tools', () => {
      expect(comicToStoryboardSkill.allowedTools).toContain(TOOL_NAMES_SYSTEM.READ_DOCUMENT);
      expect(comicToStoryboardSkill.allowedTools).toContain(TOOL_NAMES_SYSTEM.READ_IMAGE);
      expect(comicToStoryboardSkill.allowedTools).toContain(TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE);
    });

    it('should not own generation, Canvas delivery, or Cut timeline assembly', () => {
      expect(comicToStoryboardSkill.allowedTools).not.toContain(TOOL_NAMES_MEDIA.GENERATE_VIDEO);
      expect(comicToStoryboardSkill.allowedTools).not.toContain(TOOL_NAMES_MEDIA.GENERATE_TTS);
      expect(comicToStoryboardSkill.allowedTools).not.toContain(
        TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE,
      );
      expect(comicToStoryboardSkill.allowedTools).not.toContain(
        TOOL_NAMES_TIMELINE.ADD_TIMELINE_ELEMENT,
      );
    });

    it('should expose media workflow metadata and related skills', () => {
      expect(comicToStoryboardSkill.mediaWorkflow).toMatchObject({
        acceptedModalities: ['comic', 'document', 'image-sequence'],
        producedArtifacts: ['CompositeArtifact', 'GenericTable', 'StoryboardTable'],
        artifactProfiles: ['comic-shot-asset-prep', 'comic-to-animation-plan'],
        referencedCapabilities: [
          'comic-image-prep-pipeline',
          'canvas.importStoryboard',
          'cut.importStoryboard',
        ],
        suggestedProjectors: [
          'projector:comic-shot-plan-to-storyboard',
          'projector:storyboard-to-canvas',
          'projector:storyboard-to-cut',
        ],
        validationRequirements: ['CompositeArtifact', 'GenericTable', 'StoryboardTable'],
      });
      expect(comicToStoryboardSkill.referencedSkills).toEqual(
        expect.arrayContaining([
          { id: 'media-to-video', relationship: 'collaborator' },
          { id: 'storyboard-to-animation-plan', relationship: 'delegator' },
        ]),
      );
    });

    it('should guide shot image prep without claiming generated outputs', () => {
      expect(comicToStoryboardSkill.content).toContain('comic-shot-asset-prep');
      expect(comicToStoryboardSkill.content).toContain('TransformImage');
      expect(comicToStoryboardSkill.content).toContain('GenerateImage');
      expect(comicToStoryboardSkill.content).toContain('Do not claim a transformed');
    });

    it('should have comic icon', () => {
      expect(comicToStoryboardSkill.icon).toBe('📚');
    });

    it('should be enabled', () => {
      expect(comicToStoryboardSkill.enabled).toBe(true);
    });
  });

  describe('media workflow builtin skills', () => {
    it('registers the top-level coordinator and focused sub-skills', () => {
      for (const skill of [
        mediaToVideoSkill,
        comicToAnimationSkill,
        imageToShotSkill,
        storyboardToAnimationPlanSkill,
        animationPlanToCutSkill,
        generatedShotAssemblySkill,
        exportVideoPackageSkill,
      ]) {
        expect(builtinSkills.find((item) => item.name === skill.name)).toBe(skill);
        expect(skill.domain).toBe('media');
        expect(skill.mediaWorkflow).toBeDefined();
        expect(skill.content).toContain('Structured Artifact Rules');
        expect(skill.content).not.toContain('${structuredArtifactRules}');
      }
    });

    it('lets the top-level media skill reference focused sub-skills without fixed routes', () => {
      expect(mediaToVideoSkill.referencedSkills).toEqual(
        expect.arrayContaining([
          { id: 'comic-to-storyboard', relationship: 'delegator' },
          { id: 'comic-to-animation', relationship: 'delegator' },
          { id: 'image-to-shot', relationship: 'delegator' },
          { id: 'storyboard-to-animation-plan', relationship: 'delegator' },
          { id: 'animation-plan-to-cut', relationship: 'delegator' },
          { id: 'generated-shot-assembly', relationship: 'delegator' },
          { id: 'export-video-package', relationship: 'delegator' },
        ]),
      );
      expect(mediaToVideoSkill.content).not.toContain('pipeline to start');
      expect(mediaToVideoSkill.mediaWorkflow).toMatchObject({
        inputArtifacts: expect.arrayContaining(['CompositeArtifact', 'GenericTable']),
        producedArtifacts: expect.arrayContaining(['CompositeArtifact', 'GenericTable']),
        artifactProfiles: ['comic-shot-asset-prep', 'comic-to-animation-plan'],
        referencedCapabilities: ['canvas.importStoryboard', 'cut.importStoryboard'],
      });
      expect(storyboardToAnimationPlanSkill.mediaWorkflow).toMatchObject({
        inputArtifacts: ['CompositeArtifact', 'StoryboardTable'],
        validationRequirements: ['CompositeArtifact', 'StoryboardTable'],
      });
      expect(storyboardToAnimationPlanSkill.content).toContain('domainKind: "StoryboardTable"');
      expect(storyboardToAnimationPlanSkill.content).toContain('domainKind: "AnimationPlan"');
      expect(storyboardToAnimationPlanSkill.content).toContain('preparedKeyframeRefs');
      expect(comicToAnimationSkill.referencedSkills).toEqual(
        expect.arrayContaining([
          { id: 'media-to-video', relationship: 'collaborator' },
          { id: 'comic-to-storyboard', relationship: 'delegator' },
          { id: 'storyboard-to-animation-plan', relationship: 'delegator' },
        ]),
      );
      expect(comicToAnimationSkill.mediaWorkflow).toMatchObject({
        artifactProfiles: ['comic-shot-asset-prep', 'comic-to-animation-plan'],
        validationRequirements: expect.arrayContaining(['ShotImagePrepPlan']),
      });
      expect(comicToAnimationSkill.content).toContain('"domainKind": "AnimationPlan"');
      expect(comicToAnimationSkill.content).toContain('TransformImage');
      expect(comicToAnimationSkill.content).toContain('GenerateVideo');
    });
  });

  describe('localized builtin skill content', () => {
    it('normalizes supported builtin skill locales', () => {
      expect(normalizeBuiltinSkillLocale()).toBe('en');
      expect(normalizeBuiltinSkillLocale('en-US')).toBe('en');
      expect(normalizeBuiltinSkillLocale('zh-CN')).toBe('zh-cn');
      expect(normalizeBuiltinSkillLocale('zh_Hans')).toBe('zh-cn');
      expect(normalizeBuiltinSkillLocale('zh-SG')).toBe('zh-cn');
    });

    it('keeps default builtin skills in English for compatibility', () => {
      const defaultComicSkill = getComicToStoryboardSkill();
      const defaultMediaSkill = getMediaToVideoSkill();

      expect(defaultComicSkill).toBe(comicToStoryboardSkill);
      expect(defaultComicSkill.content).toContain('Comic Analysis');
      expect(defaultMediaSkill).toBe(mediaToVideoSkill);
      expect(defaultMediaSkill.content).toContain('Media to Video Coordinator');
    });

    it('selects Chinese Markdown bodies for media workflow skills', () => {
      const zhSkills = getBuiltinSkills({ locale: 'zh-CN' });
      const zhComic = zhSkills.find((skill) => skill.name === 'comic-to-storyboard');
      const zhComicAnimation = zhSkills.find((skill) => skill.name === 'comic-to-animation');
      const zhMedia = zhSkills.find((skill) => skill.name === 'media-to-video');

      expect(zhComic?.content).toContain('漫画分析');
      expect(zhComic?.content).toContain('CompositeArtifact');
      expect(zhComic?.content).toContain('StoryboardTable');
      expect(zhComic?.content).toContain('"kind": "composite-artifact"');
      expect(zhComic?.content).toContain('"domainKind": "StoryboardTable"');
      expect(zhComic?.content).toContain('图片索引和分格映射');
      expect(zhComic?.content).toContain('sourceMediaRefs');
      expect(zhComic?.content).toContain('不要对同一张图先 ReadImage 再 ReadDocumentImage');
      expect(zhComic?.content).toContain('不要在表格中嵌入 base64');
      expect(zhComic?.content).toContain('Profile 组合指引');
      expect(zhComic?.content).toContain('可组合字段包');
      expect(zhComic?.content).toContain('只输出当前素材直接支撑的维度');
      expect(zhComic?.content).toContain('最小必要字段');
      expect(zhComic?.content).toContain('不授予 Canvas、Cut');
      expect(zhMedia?.content).toContain('媒体转视频协调器');
      expect(zhMedia?.content).toContain('结构化产物规则');
      expect(zhMedia?.content).toContain('不要嵌入 base64');
      expect(zhComicAnimation?.content).toContain('漫画转动画');
      expect(zhComicAnimation?.content).toContain('AnimationPlan');
      expect(zhComicAnimation?.content).toContain('GenerateVideo');
    });

    it('keeps machine-facing skill contracts stable across locales', () => {
      const enSkills = getBuiltinSkills({ locale: 'en' });
      const zhSkills = getBuiltinSkills({ locale: 'zh-CN' });

      expect(zhSkills.map((skill) => skill.name)).toEqual(enSkills.map((skill) => skill.name));

      for (const enSkill of enSkills) {
        const zhSkill = zhSkills.find((skill) => skill.name === enSkill.name);
        expect(zhSkill).toBeDefined();
        expect(zhSkill?.description).toBe(enSkill.description);
        expect(zhSkill?.allowedTools).toEqual(enSkill.allowedTools);
        expect(zhSkill?.referencedSkills).toEqual(enSkill.referencedSkills);
        expect(zhSkill?.mediaWorkflow).toEqual(enSkill.mediaWorkflow);
      }
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

  describe('tool coverage', () => {
    it('should have AI generation tools in ai-generate skill', () => {
      expect(aiGenerateSkill.allowedTools).toContain(TOOL_NAMES_MEDIA.GENERATE_IMAGE);
      expect(aiGenerateSkill.allowedTools).toContain(TOOL_NAMES_MEDIA.TRANSFORM_IMAGE);
      expect(aiGenerateSkill.allowedTools).toContain(TOOL_NAMES_MEDIA.GENERATE_VIDEO);
      expect(aiGenerateSkill.allowedTools).toContain(TOOL_NAMES_MEDIA.GENERATE_TTS);
      expect(aiGenerateSkill.allowedTools).toContain(TOOL_NAMES_MEDIA.GENERATE_MUSIC);
    });

    it('should guide GenerateImage toward prompt or markdown intent sources', () => {
      const generateImage = aiGenerateSkill.toolDefinitions?.find(
        (tool) => tool.name === TOOL_NAMES_MEDIA.GENERATE_IMAGE,
      );

      expect(generateImage?.description).toContain('prompt');
      expect(generateImage?.parameters.prompt).toEqual(
        expect.objectContaining({ required: false }),
      );
      expect(generateImage?.parameters.taskRef).toEqual(
        expect.objectContaining({ required: false }),
      );
      expect(aiGenerateSkill.content).toContain('Generation Intent Sources');
      expect(aiGenerateSkill.content).toContain('taskRef');
    });

    it('should expose TransformImage as a source-bound image edit tool', () => {
      const transformImage = aiGenerateSkill.toolDefinitions?.find(
        (tool) => tool.name === TOOL_NAMES_MEDIA.TRANSFORM_IMAGE,
      );

      expect(transformImage?.description).toContain('Transform');
      expect(transformImage?.parameters.editInstruction).toEqual(
        expect.objectContaining({ required: false }),
      );
      expect(transformImage?.parameters.sourceImageUri).toEqual(
        expect.objectContaining({ required: false }),
      );
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
