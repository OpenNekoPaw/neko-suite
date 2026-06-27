/**
 * Comic to Storyboard Skill - Convert manga/comic pages to structured storyboards
 *
 * Provides comic panel analysis, OCR, shot-local character cues, and artifact-backed StoryboardTable output.
 * Triggered when user explicitly asks for a structured comic storyboard or StoryboardTable.
 */

import type { Skill } from '@neko/shared';
import { TOOL_NAMES_SYSTEM } from '@neko/shared';
import { localizeBuiltinSkill } from './builtin-skill-content';
import comicToStoryboardContent from './markdown/comic-to-storyboard.md?raw';
import comicToStoryboardZhCnContent from './markdown/comic-to-storyboard.zh-cn.md?raw';

const localizedComicToStoryboardContent = {
  default: comicToStoryboardContent,
  localized: {
    'zh-cn': comicToStoryboardZhCnContent,
  },
};

/**
 * Comic to Storyboard skill - Convert manga/comic pages to structured storyboards
 *
 * Triggered when user explicitly asks for a structured comic storyboard or StoryboardTable.
 */
export const comicToStoryboardSkill: Skill = {
  name: 'comic-to-storyboard',
  description:
    'Convert manga/comic pages into CompositeArtifact storyboards with StoryboardTable domain payloads. ' +
    'Use only when the user asks to create or update a comic storyboard table, shot breakdown, ' +
    'comic adaptation storyboard, or webtoon storyboard; not for content-only EPUB/comic analysis. ' +
    'Keywords: comic storyboard, storyboard table, shot breakdown, 漫画分镜, 分镜表, 生成分镜表.',
  content: comicToStoryboardContent,
  allowedTools: [
    // Vision analysis (LLM with image input)
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    TOOL_NAMES_SYSTEM.READ_IMAGE,
    TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE,
    TOOL_NAMES_SYSTEM.LIST_DIRECTORY,
    TOOL_NAMES_SYSTEM.GLOB,
  ],
  icon: '📚',
  source: 'builtin',
  enabled: true,
  version: '1.0.0',
  domain: 'media',
  referencedSkills: [
    { id: 'media-to-video', relationship: 'collaborator' },
    { id: 'storyboard-to-animation-plan', relationship: 'delegator' },
    { id: 'animation-plan-to-cut', relationship: 'delegator' },
  ],
  mediaWorkflow: {
    useCases: [
      'Create a structured storyboard table from comic, manga, webtoon, PDF, or image pages',
      'Convert panel analysis and OCR evidence into a CompositeArtifact StoryboardTable',
      'Build a shot breakdown for comic adaptation before animation or Cut handoff',
    ],
    nonGoals: [
      'Analyze, summarize, OCR, describe, or read comic pages without creating a storyboard artifact',
      'Generate images, videos, audio, Canvas scenes, or Cut timelines directly',
      'Create project entity memory or character identity records',
    ],
    acceptedModalities: ['comic', 'document', 'image-sequence'],
    inputArtifacts: ['comic', 'manga', 'webtoon', 'PDF', 'image-sequence', 'MediaTextSegment'],
    producedArtifacts: ['CompositeArtifact', 'StoryboardTable'],
    artifactProfiles: ['comic-to-animation-plan'],
    referencedCapabilities: ['canvas.importStoryboard', 'cut.importStoryboard'],
    suggestedProjectors: [
      'projector:comic-shot-plan-to-storyboard',
      'projector:storyboard-to-canvas',
      'projector:storyboard-to-cut',
    ],
    tags: ['comic', 'manga', 'storyboard'],
    operations: ['create-storyboard', 'shot-breakdown', 'panel-analysis', 'ocr-to-storyboard'],
    costLevel: 'low',
    riskLevel: 'low',
    validationRequirements: ['CompositeArtifact', 'StoryboardTable'],
    optionalTools: [
      TOOL_NAMES_SYSTEM.READ_IMAGE,
      TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE,
    ],
  },
};

export function getComicToStoryboardSkill(locale?: string): Skill {
  return localizeBuiltinSkill(comicToStoryboardSkill, localizedComicToStoryboardContent, locale);
}
