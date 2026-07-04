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

    it('should expose Agent-readable catalog metadata for production and media Skills', () => {
      const catalogSkillNames = [
        'ai-generate',
        'video-editing',
        'color-grading',
        'audio-mixing',
        'subtitle-assistant',
        'script-generation',
        'script-to-timeline',
        'scene-to-music',
        'media-to-video',
        'comic-to-animation',
        'comic-to-storyboard',
        'image-to-shot',
        'storyboard-to-animation-plan',
        'animation-plan-to-cut',
        'generated-shot-assembly',
        'export-video-package',
        'quality-assessment',
      ];

      for (const skillName of catalogSkillNames) {
        const skill = builtinSkills.find((item) => item.name === skillName);
        expect(skill, `missing builtin Skill ${skillName}`).toBeDefined();
        expect(skill?.mediaWorkflow?.useCases?.length, `${skillName} useCases`).toBeGreaterThan(0);
        expect(skill?.mediaWorkflow?.nonGoals?.length, `${skillName} nonGoals`).toBeGreaterThan(0);
        expect(skill?.mediaWorkflow?.operations?.length, `${skillName} operations`).toBeGreaterThan(
          0,
        );
        expect(
          [
            ...(skill?.mediaWorkflow?.acceptedModalities ?? []),
            ...(skill?.mediaWorkflow?.inputArtifacts ?? []),
          ].length,
          `${skillName} input metadata`,
        ).toBeGreaterThan(0);
        expect(
          skill?.mediaWorkflow?.producedArtifacts?.length,
          `${skillName} outputs`,
        ).toBeGreaterThan(0);
      }
    });
  });

  describe('comicToStoryboardSkill', () => {
    it('should have correct name', () => {
      expect(comicToStoryboardSkill.name).toBe('comic-to-storyboard');
    });

    it('should describe the domain without keyword-trigger routing hints', () => {
      expect(comicToStoryboardSkill.description).toContain('comic');
      expect(comicToStoryboardSkill.description).toContain('manga');
      expect(comicToStoryboardSkill.description).toContain('storyboard');
      expect(comicToStoryboardSkill.description).not.toContain('Keywords:');
      expect(comicToStoryboardSkill.description).not.toContain('生成分镜表');
    });

    it('should have content with workflow instructions', () => {
      expect(comicToStoryboardSkill.content).toContain('Gather Visual Evidence');
      expect(comicToStoryboardSkill.content).toContain('Panel');
      expect(comicToStoryboardSkill.content).toContain('OCR');
      expect(comicToStoryboardSkill.content).toContain('Markdown creative table');
      expect(comicToStoryboardSkill.content).toContain(
        'A manifest-only ReadDocument result is not visual evidence',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'If ReadDocument does not return `imageInfo[]`',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'If manifest returns no `imageInfo[]`, continue with ReadDocument mode="content" or mode="next"',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'Do not output storyboard rows until ReadImage has returned visual evidence',
      );
      expect(comicToStoryboardSkill.content).toContain('Canvas Handoff');
      expect(comicToStoryboardSkill.content).toContain('Field Roles');
    });

    it('should request one creative table without internal handoff prompts', () => {
      expect(comicToStoryboardSkill.content).toContain('Markdown creative table');
      expect(comicToStoryboardSkill.content).toContain('exactly one Markdown creative table');
      expect(comicToStoryboardSkill.content).toContain('Do not output YAML frontmatter');
      expect(comicToStoryboardSkill.content).toContain('kind: draft');
      expect(comicToStoryboardSkill.content).toContain('domain: storyboard');
      expect(comicToStoryboardSkill.content).toContain('referenceChain:');
      expect(comicToStoryboardSkill.content).toContain(
        '`scene`, `shot`, `source`, `sourcePanel`, `decision`, `duration`, `visual`, `motion`, `audio`, `characters`, `dialogue`, `imagePrompt`, `imageEditPrompt`, `shotVideoPrompt`, `videoEditPrompt`, `sceneStylePrompt`, `sceneVideoPrompt`, `sceneVideoEditPrompt`, `reviewStatus`, `nextAction`, `contentType`, `decisionReason`, `requiresSplit`, `duplicateOf`',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'use these canonical stable field ids exactly for known columns',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'Do not localize known field headers in new Markdown output',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'Known fields are resolved through the shared storyboard profile',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'the Webview displays those fields in the current UI locale',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'Unknown extension columns keep their raw Markdown headers',
      );
      expect(comicToStoryboardSkill.content).toContain('open review metadata');
      expect(comicToStoryboardSkill.content).toContain('nextAction` is plan text only');
      expect(comicToStoryboardSkill.content).toContain('Chinese/localized headers');
      expect(comicToStoryboardSkill.content).toContain('`read-image-*.jpg`');
      expect(comicToStoryboardSkill.content).toContain('![P1](P1)');
      expect(comicToStoryboardSkill.content).toContain('Codex-style standard Markdown');
      expect(comicToStoryboardSkill.content).toContain('![alt](resource-token)');
      expect(comicToStoryboardSkill.content).toContain('Resource References');
      expect(comicToStoryboardSkill.content).toContain('CommonMark images');
      expect(comicToStoryboardSkill.content).toContain('resource-reference');
      expect(comicToStoryboardSkill.content).toContain(
        'Never output a simplified page-analysis table',
      );
      expect(comicToStoryboardSkill.content).toContain('Forbidden primary headers include');
      expect(comicToStoryboardSkill.content).toContain('`景别/构图`');
      expect(comicToStoryboardSkill.content).toContain('`页码`');
      expect(comicToStoryboardSkill.content).toContain('`节奏/情绪`');
      expect(comicToStoryboardSkill.content).toContain('`画面内容`');
      expect(comicToStoryboardSkill.content).toContain('`图像提示词`');
      expect(comicToStoryboardSkill.content).toContain(
        'Localized labels such as `画面内容`, `图像提示词`, and `建议操作` are acceptable',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'Do not say the storyboard anchors can be added later',
      );
      expect(comicToStoryboardSkill.content).toContain('needs-panel-analysis');
      expect(comicToStoryboardSkill.content).toContain('Do not output a second');
      expect(comicToStoryboardSkill.content).toContain('keep/skip/merge/split/duplicate');
      expect(comicToStoryboardSkill.content).toContain(
        'Covers, repeated pages, ads, blanks, and metadata pages',
      );
      expect(comicToStoryboardSkill.content).toContain('Use `decisionReason`');
      expect(comicToStoryboardSkill.content).toContain('Use `requiresSplit` as `true`');
      expect(comicToStoryboardSkill.content).toContain('Use `duplicateOf`');
      expect(comicToStoryboardSkill.content).toContain('needs-resource-binding');
      expect(comicToStoryboardSkill.content).toContain('placement/crop intent');
      expect(comicToStoryboardSkill.content).toContain('only when that exact target is present');
      expect(comicToStoryboardSkill.content).toContain('If no stable resource binding is visible');
      expect(comicToStoryboardSkill.content).toContain('Do not use Neko/Obsidian-style');
      expect(comicToStoryboardSkill.content).toContain('runtime tool list');
      expect(comicToStoryboardSkill.content).toContain('visible as review metadata');
      expect(comicToStoryboardSkill.content).toContain('Approval/review fields');
      expect(comicToStoryboardSkill.content).toContain('Plan fields');
      expect(comicToStoryboardSkill.content).toContain('Execution fields');
      expect(comicToStoryboardSkill.content).toContain('reviewStatus');
      expect(comicToStoryboardSkill.content).toContain('nextAction');
      expect(comicToStoryboardSkill.content).toContain('domain node JSON');
      expect(comicToStoryboardSkill.content).toContain(
        'build an internal image index and panel mapping',
      );
      expect(comicToStoryboardSkill.content).toContain('needs rotation');
      expect(comicToStoryboardSkill.content).toContain('one image as a possible source');
      expect(comicToStoryboardSkill.content).toContain(
        'Do not treat chat attachment order as resource identity',
      );
      expect(comicToStoryboardSkill.content).toContain('Do not write render URIs');
      expect(comicToStoryboardSkill.content).toContain('Webview URIs');
      expect(comicToStoryboardSkill.content).toContain('blob URLs');
      expect(comicToStoryboardSkill.content).toContain('system temp paths');
      expect(comicToStoryboardSkill.content).toContain('Engine tokens');
      expect(comicToStoryboardSkill.content).toContain(
        'Do not claim Canvas success unless a Canvas capability/tool returns success',
      );
      expect(comicToStoryboardSkill.content).toContain('Character And Text Notes');
      expect(comicToStoryboardSkill.content).toContain('OCR evidence');
      expect(comicToStoryboardSkill.content).toContain('QuerySemanticCoverage');
      expect(comicToStoryboardSkill.content).toContain('must not replace ReadImage');
      expect(comicToStoryboardSkill.content).toContain('is not visual analysis');
      expect(comicToStoryboardSkill.content).toContain('Do not inspect `.neko/.cache`');
      expect(comicToStoryboardSkill.content).toContain('`dialogue`');
      expect(comicToStoryboardSkill.content).toContain('narration');
      expect(comicToStoryboardSkill.content).toContain('background text');
      expect(comicToStoryboardSkill.content).toContain('Only character speech bubbles');
      expect(comicToStoryboardSkill.content).toContain('speaker binding');
      expect(comicToStoryboardSkill.content).not.toContain('CompositeArtifact');
      expect(comicToStoryboardSkill.content).not.toContain('StoryboardTable');
      expect(comicToStoryboardSkill.content).not.toContain('neko-composite');
      expect(comicToStoryboardSkill.content).not.toContain('sourceMediaRefs');
      expect(comicToStoryboardSkill.content).not.toContain('generatedMediaRefs');
      expect(comicToStoryboardSkill.content).not.toContain('imageStrategy');
      expect(comicToStoryboardSkill.content).not.toContain('schemaVersion');
      expect(comicToStoryboardSkill.content).not.toContain('domainKind');
      expect(comicToStoryboardSkill.content).not.toContain('storyboard-table');
      expect(comicToStoryboardSkill.content).not.toContain('old plugin-transfer');
      expect(comicToStoryboardSkill.content).not.toContain('@neko/draft-runtime');
      expect(comicToStoryboardSkill.content).not.toContain('compile-storyboard-table');
      expect(comicToStoryboardSkill.content).not.toContain('Canvas-ingestable');
      expect(comicToStoryboardSkill.content).not.toContain('canvas.ingestMarkdown');
      expect(comicToStoryboardSkill.content).not.toContain('intentHint');
      expect(comicToStoryboardSkill.content).not.toContain('profileHint');
      expect(comicToStoryboardSkill.content).not.toContain('Canvas node JSON');
      expect(comicToStoryboardSkill.content).not.toContain('transfer payload JSON');
    });

    it('should keep entity memory and image prep outside comic-to-storyboard', () => {
      expect(comicToStoryboardSkill.content).not.toContain('Progressive Character Memory');
      expect(comicToStoryboardSkill.content).not.toContain('Shot Image Prep Profile');
      expect(comicToStoryboardSkill.content).not.toContain('neko.entityMemoryContributionPayload');
      expect(comicToStoryboardSkill.content).not.toContain('EntityMemoryContribution');
      expect(comicToStoryboardSkill.content).not.toContain('entityCandidates');
      expect(comicToStoryboardSkill.content).not.toContain('identityBasis');
      expect(comicToStoryboardSkill.content).not.toContain('candidate-ambiguous');
      expect(comicToStoryboardSkill.content).not.toContain('neko.storyboardEntityMapping');
      expect(comicToStoryboardSkill.content).not.toContain('comic-shot-asset-prep');
      expect(comicToStoryboardSkill.content).not.toContain('TransformImage');
      expect(comicToStoryboardSkill.content).not.toContain('GenerateImage');
      expect(comicToStoryboardSkill.content).not.toContain('metadata.regenerationRecommendation');
    });

    it('should group storyboard shots into coarser scenes', () => {
      expect(comicToStoryboardSkill.content).toContain(
        'Every row represents a narrative shot or video beat',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'The same `source` may appear in multiple rows',
      );
      expect(comicToStoryboardSkill.content).toContain('scene');
      expect(comicToStoryboardSkill.content).toContain('shot');
    });

    it('should avoid duplicate image resource reads for the same comic image batch', () => {
      expect(comicToStoryboardSkill.content).toContain(
        'Use ReadImage with mode="metadata" for page images only after ReadDocument returns',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'pass those entries unchanged as structured `images[]`',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'Do not invent another image access path for the same document image',
      );
      expect(comicToStoryboardSkill.content).toContain(
        'Analyze returned images with the current native multimodal model',
      );
    });

    it('should have required tools', () => {
      expect(comicToStoryboardSkill.allowedTools).toContain(TOOL_NAMES_SYSTEM.READ_DOCUMENT);
      expect(comicToStoryboardSkill.allowedTools).toContain(TOOL_NAMES_SYSTEM.READ_IMAGE);
      expect(comicToStoryboardSkill.allowedTools).toContain(
        TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE,
      );
    });

    it('should allow Agent-led Canvas Markdown lifecycle handoff tools', () => {
      expect(comicToStoryboardSkill.allowedTools).toEqual(
        expect.arrayContaining([
          TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN,
          TOOL_NAMES_CANVAS.CANVAS_CREATE_STORYBOARD_DRAFT_FROM_MARKDOWN,
          TOOL_NAMES_CANVAS.CANVAS_CREATE_STORYBOARD_FROM_MARKDOWN,
          TOOL_NAMES_CANVAS.CANVAS_VALIDATE_MARKDOWN_STORYBOARD,
        ]),
      );
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
        useCases: expect.arrayContaining([
          'Create a reviewable Markdown creative table from comic, manga, webtoon, PDF, or image pages',
        ]),
        nonGoals: expect.arrayContaining([
          'Analyze, summarize, OCR, describe, or read comic pages without creating a storyboard artifact',
        ]),
        acceptedModalities: ['comic', 'document', 'image-sequence'],
        inputArtifacts: expect.arrayContaining(['MediaTextSegment', 'comic']),
        producedArtifacts: expect.arrayContaining(['CreativeTable']),
        operations: expect.arrayContaining(['create-storyboard']),
        artifactProfiles: ['storyboard'],
        referencedCapabilities: ['canvas.ingestMarkdown', 'canvas.validateMarkdownStoryboard'],
        suggestedProjectors: ['capability:canvas.ingestMarkdown'],
        validationRequirements: ['CanvasMarkdownCapabilityInput'],
      });
      expect(comicToStoryboardSkill.referencedSkills).toEqual(
        expect.arrayContaining([
          { id: 'media-to-video', relationship: 'collaborator' },
          { id: 'storyboard-to-animation-plan', relationship: 'delegator' },
        ]),
      );
      expect(comicToStoryboardSkill.mediaWorkflow?.producedArtifacts).not.toContain(
        'EntityMemoryContribution',
      );
      expect(comicToStoryboardSkill.mediaWorkflow?.producedArtifacts).not.toContain('GenericTable');
      expect(comicToStoryboardSkill.mediaWorkflow?.producedArtifacts).not.toContain(
        'CompositeArtifact',
      );
      expect(comicToStoryboardSkill.mediaWorkflow?.producedArtifacts).not.toContain(
        'StoryboardTable',
      );
      expect(comicToStoryboardSkill.mediaWorkflow?.artifactProfiles).not.toContain(
        'comic-shot-asset-prep',
      );
      expect(comicToStoryboardSkill.mediaWorkflow?.artifactProfiles).not.toContain(
        'creative-table.storyboard',
      );
      expect(comicToStoryboardSkill.mediaWorkflow?.validationRequirements).not.toContain(
        'creative-table.storyboard',
      );
      expect(comicToStoryboardSkill.mediaWorkflow?.referencedCapabilities).not.toContain(
        'comic-image-prep-pipeline',
      );
      expect(comicToStoryboardSkill.mediaWorkflow?.referencedCapabilities).not.toContain(
        'canvas.importStoryboard',
      );
      expect(comicToStoryboardSkill.mediaWorkflow?.referencedCapabilities).not.toContain(
        'canvas.createStoryboardFromMarkdown',
      );
      expect(comicToStoryboardSkill.mediaWorkflow?.referencedCapabilities).not.toContain(
        'cut.importStoryboard',
      );
      expect(comicToStoryboardSkill.mediaWorkflow?.referencedCapabilities).toContain(
        'canvas.ingestMarkdown',
      );
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
        expect(skill.content).not.toContain('${structuredArtifactRules}');
        expect(skill.content).not.toContain('old plugin-transfer');
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
      expect(mediaToVideoSkill.content).not.toContain('workflow DAG');
      expect(mediaToVideoSkill.content).not.toContain('TypeScript route');
      expect(mediaToVideoSkill.content).not.toContain('read .neko');
      expect(mediaToVideoSkill.allowedTools).toContain(TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE);
      expect(mediaToVideoSkill.mediaWorkflow).toMatchObject({
        useCases: expect.arrayContaining([
          'Coordinate explicit media-to-video production across storyboard, generation, Canvas, Cut, and export steps',
        ]),
        nonGoals: expect.arrayContaining([
          'Analyze, summarize, OCR, describe, or read source media without creating production artifacts',
        ]),
        inputArtifacts: expect.arrayContaining(['CreativeTable', 'GenericTable']),
        producedArtifacts: expect.arrayContaining([
          'CreativeTable',
          'GenericTable',
          'EntityMemoryContribution',
        ]),
        artifactProfiles: ['storyboard', 'comic-shot-asset-prep'],
        referencedCapabilities: ['canvas.ingestMarkdown', 'canvas.validateMarkdownStoryboard'],
        operations: expect.arrayContaining(['coordinate-media-production']),
      });
      expect(mediaToVideoSkill.content).toContain('Markdown creative tables');
      expect(mediaToVideoSkill.content).toContain('runtime tool list');
      expect(mediaToVideoSkill.content).toMatch(/do not output domain node JSON/i);
      expect(mediaToVideoSkill.content).toContain('visible as review metadata');
      expect(mediaToVideoSkill.content).not.toContain('Markdown storyboard drafts');
      expect(mediaToVideoSkill.content).not.toContain('canvas.ingestMarkdown');
      expect(mediaToVideoSkill.content).not.toContain('intentHint');
      expect(mediaToVideoSkill.content).not.toContain('profileHint');
      expect(mediaToVideoSkill.content).not.toContain('Canvas node JSON');
      expect(storyboardToAnimationPlanSkill.mediaWorkflow).toMatchObject({
        inputArtifacts: ['CreativeTable', 'CanvasStoryboardReviewNode'],
        operations: expect.arrayContaining(['storyboard-to-animation-plan']),
        validationRequirements: ['CreativeTable', 'AnimationPlan'],
      });
      expect(storyboardToAnimationPlanSkill.content).toContain(
        'reviewed storyboard creative table',
      );
      expect(storyboardToAnimationPlanSkill.content).toContain('animation plan');
      expect(storyboardToAnimationPlanSkill.content).toContain('preparedKeyframe');
      expect(storyboardToAnimationPlanSkill.content).not.toContain('CompositeArtifact');
      expect(storyboardToAnimationPlanSkill.content).not.toContain('StoryboardTable');
      expect(storyboardToAnimationPlanSkill.content).not.toContain('sourceMediaRefs');
      expect(storyboardToAnimationPlanSkill.content).not.toContain('imageStrategy');
      expect(comicToAnimationSkill.referencedSkills).toEqual(
        expect.arrayContaining([
          { id: 'media-to-video', relationship: 'collaborator' },
          { id: 'comic-to-storyboard', relationship: 'delegator' },
          { id: 'storyboard-to-animation-plan', relationship: 'delegator' },
        ]),
      );
      expect(comicToAnimationSkill.mediaWorkflow).toMatchObject({
        artifactProfiles: ['storyboard', 'comic-shot-asset-prep'],
        validationRequirements: expect.arrayContaining([
          'CreativeTable',
          'CanvasMarkdownCapabilityInput',
          'AnimationPlan',
          'ShotImagePrepPlan',
        ]),
      });
      expect(comicToAnimationSkill.mediaWorkflow?.producedArtifacts).toEqual(
        expect.arrayContaining(['CreativeTable', 'AnimationPlan', 'EntityMemoryContribution']),
      );
      expect(comicToAnimationSkill.content).toContain('Lifecycle Artifact Rules');
      expect(comicToAnimationSkill.content).toContain('Entity memory and character evidence');
      expect(comicToAnimationSkill.content).toContain('review evidence');
      expect(comicToAnimationSkill.content).toContain('diagnostics');
      expect(comicToAnimationSkill.content).toContain('review recommendation');
      expect(comicToAnimationSkill.content).toContain('imageAudit');
      expect(comicToAnimationSkill.content).toContain('split-panels');
      expect(comicToAnimationSkill.content).toContain('rotate');
      expect(comicToAnimationSkill.content).toContain('A single source image may create multiple');
      expect(comicToAnimationSkill.content).toContain('QuerySemanticCoverage');
      expect(comicToAnimationSkill.content).toContain('cache paths');
      expect(comicToAnimationSkill.allowedTools).toContain(
        TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE,
      );
      expect(comicToAnimationSkill.content).toContain('TransformImage');
      expect(comicToAnimationSkill.content).toContain('GenerateVideo');
      expect(comicToAnimationSkill.content).not.toContain('CompositeArtifact');
      expect(comicToAnimationSkill.content).not.toContain('StoryboardTable');
      expect(comicToAnimationSkill.content).not.toContain('neko-composite');
      expect(comicToAnimationSkill.content).not.toContain('sourceMediaRefs');
      expect(comicToAnimationSkill.content).not.toContain('imageStrategy');
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
      expect(defaultComicSkill.content).toContain('Gather Visual Evidence');
      expect(defaultMediaSkill).toBe(mediaToVideoSkill);
      expect(defaultMediaSkill.content).toContain('Media to Video Coordinator');
    });

    it('selects Chinese Markdown bodies for media workflow skills', () => {
      const zhSkills = getBuiltinSkills({ locale: 'zh-CN' });
      const zhComic = zhSkills.find((skill) => skill.name === 'comic-to-storyboard');
      const zhComicAnimation = zhSkills.find((skill) => skill.name === 'comic-to-animation');
      const zhMedia = zhSkills.find((skill) => skill.name === 'media-to-video');

      expect(zhComic?.content).toContain('获取视觉证据');
      expect(zhComic?.content).toContain('Markdown creative table');
      expect(zhComic?.content).toContain('这张表就是分镜表');
      expect(zhComic?.content).toContain('只有 manifest 的 ReadDocument 结果不是视觉证据');
      expect(zhComic?.content).toContain('如果 ReadDocument 没有返回 `imageInfo[]`');
      expect(zhComic?.content).toContain(
        '如果 manifest 没有返回 `imageInfo[]`，继续用 ReadDocument mode="content" 或 mode="next"',
      );
      expect(zhComic?.content).toContain('ReadImage 返回视觉证据前，不要输出分镜行');
      expect(zhComic?.content).toContain('必须对已知列精确使用以下 canonical 稳定字段 id');
      expect(zhComic?.content).toContain('新 Markdown 输出不要本地化已知字段表头');
      expect(zhComic?.content).toContain('已知字段由 shared storyboard profile 解析');
      expect(zhComic?.content).toContain('Webview 会按当前 UI 语言展示字段标签');
      expect(zhComic?.content).toContain('未知扩展列会保留 Markdown 原表头');
      expect(zhComic?.content).toContain('开放的审阅 metadata');
      expect(zhComic?.content).toContain('`nextAction` 只是计划文本');
      expect(zhComic?.content).toContain('中文/本地化表头');
      expect(zhComic?.content).toContain('本 Skill 新生成的已知字段表头应使用 canonical field id');
      expect(zhComic?.content).toContain(
        '`scene`, `shot`, `source`, `sourcePanel`, `decision`, `duration`, `visual`, `motion`, `audio`, `characters`, `dialogue`, `imagePrompt`, `imageEditPrompt`, `shotVideoPrompt`, `videoEditPrompt`, `sceneStylePrompt`, `sceneVideoPrompt`, `sceneVideoEditPrompt`, `reviewStatus`, `nextAction`, `contentType`, `decisionReason`, `requiresSplit`, `duplicateOf`',
      );
      expect(zhComic?.content).toContain('`read-image-*.jpg`');
      expect(zhComic?.content).toContain('![P1](P1)');
      expect(zhComic?.content).toContain('Codex-style 标准 Markdown');
      expect(zhComic?.content).toContain('完全相同 target');
      expect(zhComic?.content).toContain('绝不能把简化的页级分析表当作分镜表输出');
      expect(zhComic?.content).toContain('`页码`');
      expect(zhComic?.content).toContain('`节奏/情绪`');
      expect(zhComic?.content).toContain('`画面内容`');
      expect(zhComic?.content).toContain('`图像提示词`');
      expect(zhComic?.content).toContain('不要说分镜锚点之后再补');
      expect(zhComic?.content).toContain('needs-panel-analysis');
      expect(zhComic?.content).toContain('不要再输出第二张');
      expect(zhComic?.content).toContain('keep/skip/merge/split/duplicate');
      expect(zhComic?.content).toContain('封面、重复页、广告页、空白页和元数据页');
      expect(zhComic?.content).toContain('`requiresSplit` 写 `true`');
      expect(zhComic?.content).toContain('`duplicateOf`');
      expect(zhComic?.content).toContain('P1#panel_1');
      expect(zhComic?.content).toContain('不要使用 `![[cover.png]]`');
      expect(zhComic?.content).toContain('Canvas 交接');
      expect(zhComic?.content).toContain('CommonMark 图片');
      expect(zhComic?.content).toContain('resource-reference');
      expect(zhComic?.content).toContain('needs-resource-binding');
      expect(zhComic?.content).toContain('分格/裁切意图');
      expect(zhComic?.content).toContain('运行时工具列表');
      expect(zhComic?.content).toContain('审阅 metadata 可见保留');
      expect(zhComic?.content).toContain('内部图片索引和分格映射');
      expect(zhComic?.content).toContain('需要旋转');
      expect(zhComic?.content).toContain('一页或一张图可能对应多个 storyboard shot');
      expect(zhComic?.content).toContain('不要把聊天附件顺序当成资源身份');
      expect(zhComic?.content).toContain('不要为同一张文档图片编造第二个图片访问路径');
      expect(zhComic?.content).toContain('QuerySemanticCoverage');
      expect(zhComic?.content).toContain('不能替代 ReadImage');
      expect(zhComic?.content).toContain('不是视觉分析');
      expect(zhComic?.content).toContain('不要检查 `.neko/.cache`');
      expect(zhComic?.content).toContain('base64 图片数据');
      expect(zhComic?.content).toContain('Webview URI');
      expect(zhComic?.content).toContain('blob URL');
      expect(zhComic?.content).toContain('系统临时路径');
      expect(zhComic?.content).toContain('Engine token');
      expect(zhComic?.content).toContain('领域节点 JSON');
      expect(zhComic?.content).toContain('人物和文字说明');
      expect(zhComic?.content).toContain('不创建或确认项目统一实体');
      expect(zhComic?.content).toContain('不要从本 Skill 输出实体贡献 payload');
      expect(zhComic?.content).not.toContain('CompositeArtifact');
      expect(zhComic?.content).not.toContain('StoryboardTable');
      expect(zhComic?.content).not.toContain('neko-composite');
      expect(zhComic?.content).not.toContain('sourceMediaRefs');
      expect(zhComic?.content).not.toContain('generatedMediaRefs');
      expect(zhComic?.content).not.toContain('imageStrategy');
      expect(zhComic?.content).not.toContain('schemaVersion');
      expect(zhComic?.content).not.toContain('domainKind');
      expect(zhComic?.content).not.toContain('storyboard-table');
      expect(zhComic?.content).not.toContain('old plugin-transfer');
      expect(zhComic?.content).not.toContain('neko.entityMemoryContributionPayload');
      expect(zhComic?.content).not.toContain('candidate-ambiguous');
      expect(zhComic?.content).not.toContain('@neko/draft-runtime');
      expect(zhComic?.content).not.toContain('compile-storyboard-table');
      expect(zhComic?.content).not.toContain('Canvas-ingestable');
      expect(zhComic?.content).not.toContain('canvas.ingestMarkdown');
      expect(zhComic?.content).not.toContain('intentHint');
      expect(zhComic?.content).not.toContain('profileHint');
      expect(zhComic?.content).not.toContain('Canvas node JSON');
      expect(zhMedia?.content).toContain('媒体转视频协调器');
      expect(zhMedia?.content).toContain('结构化产物规则');
      expect(zhMedia?.content).toContain('运行时工具列表');
      expect(zhMedia?.content).toContain('不要输出领域节点 JSON');
      expect(zhMedia?.content).toContain('审阅 metadata 可见保留');
      expect(zhMedia?.content).not.toContain('canvas.ingestMarkdown');
      expect(zhMedia?.content).not.toContain('intentHint');
      expect(zhMedia?.content).not.toContain('profileHint');
      expect(zhMedia?.content).not.toContain('Canvas node JSON');
      expect(zhMedia?.content).toContain('不要嵌入 base64');
      expect(zhMedia?.content).toContain('QuerySemanticCoverage');
      expect(zhComicAnimation?.content).toContain('漫画转动画');
      expect(zhComicAnimation?.content).toContain('Lifecycle Artifact 规则');
      expect(zhComicAnimation?.content).toContain('实体记忆和人物证据');
      expect(zhComicAnimation?.content).toContain('review status');
      expect(zhComicAnimation?.content).toContain('imageAudit');
      expect(zhComicAnimation?.content).toContain('split-panels');
      expect(zhComicAnimation?.content).toContain('rotate');
      expect(zhComicAnimation?.content).toContain('一张来源图可以生成多个 storyboard shot');
      expect(zhComicAnimation?.content).toContain('缓存路径');
      expect(zhComicAnimation?.content).toContain('动画计划');
      expect(zhComicAnimation?.content).toContain('GenerateVideo');
      expect(zhComicAnimation?.content).not.toContain('CompositeArtifact');
      expect(zhComicAnimation?.content).not.toContain('StoryboardTable');
      expect(zhComicAnimation?.content).not.toContain('neko-composite');
      expect(zhComicAnimation?.content).not.toContain('sourceMediaRefs');
      expect(zhComicAnimation?.content).not.toContain('imageStrategy');
    });

    it('keeps machine-facing skill contracts stable across locales while localizing descriptions', () => {
      const enSkills = getBuiltinSkills({ locale: 'en' });
      const zhSkills = getBuiltinSkills({ locale: 'zh-CN' });

      expect(zhSkills.map((skill) => skill.name)).toEqual(enSkills.map((skill) => skill.name));

      for (const enSkill of enSkills) {
        const zhSkill = zhSkills.find((skill) => skill.name === enSkill.name);
        expect(zhSkill).toBeDefined();
        expect(zhSkill?.allowedTools).toEqual(enSkill.allowedTools);
        expect(zhSkill?.referencedSkills).toEqual(enSkill.referencedSkills);
        expect(zhSkill?.mediaWorkflow).toEqual(enSkill.mediaWorkflow);
      }

      const enComic = enSkills.find((skill) => skill.name === 'comic-to-storyboard');
      const zhComic = zhSkills.find((skill) => skill.name === 'comic-to-storyboard');
      expect(zhComic?.description).not.toBe(enComic?.description);
      expect(zhComic?.description).toContain('分镜');
    });
  });

  describe('scriptGenerationSkill', () => {
    it('should have correct name', () => {
      expect(scriptGenerationSkill.name).toBe('script-generation');
    });

    it('should have description with discoverable domain terms', () => {
      expect(scriptGenerationSkill.description).toContain('script');
      expect(scriptGenerationSkill.description).toContain('screenplay');
      expect(scriptGenerationSkill.description).toContain('Agent has confirmed');
      expect(scriptGenerationSkill.description).not.toContain('Use when user mentions');
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

    it('should have description with discoverable domain terms (en + zh)', () => {
      expect(qualityAssessmentSkill.description).toContain('quality');
      expect(qualityAssessmentSkill.description).toContain('artifacts');
      expect(qualityAssessmentSkill.description).toContain('loudness');
      expect(qualityAssessmentSkill.description).toContain('Agent has confirmed');
      expect(qualityAssessmentSkill.description).not.toContain('Use when user mentions');
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
