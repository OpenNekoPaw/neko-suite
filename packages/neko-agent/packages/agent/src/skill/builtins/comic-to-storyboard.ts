/**
 * Comic to Storyboard Skill - Convert manga/comic pages to structured storyboards
 *
 * Provides comic panel analysis, OCR, character tracking, and artifact-backed StoryboardTable output.
 * Triggered when user mentions: comic storyboard, manga analysis, comic adaptation
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
 * Triggered when user mentions: comic storyboard, manga analysis, comic adaptation
 */
export const comicToStoryboardSkill: Skill = {
  name: 'comic-to-storyboard',
  description:
    'Convert manga/comic pages into CompositeArtifact storyboards with StoryboardTable domain payloads. ' +
    'Use when user mentions: comic storyboard, manga analysis, panel OCR, ' +
    'comic adaptation planning, webtoon storyboard, 漫画分镜, 漫画分析.',
  content: comicToStoryboardContent,
  allowedTools: [
    // Vision analysis (LLM with image input)
    TOOL_NAMES_SYSTEM.READ,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    TOOL_NAMES_SYSTEM.READ_IMAGE,
    TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE,
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
    acceptedModalities: ['comic', 'document', 'image-sequence'],
    producedArtifacts: ['CompositeArtifact', 'GenericTable', 'StoryboardTable'],
    artifactProfiles: ['comic-shot-asset-prep', 'comic-to-animation-plan'],
    referencedCapabilities: ['canvas.importStoryboard', 'cut.importStoryboard'],
    suggestedProjectors: [
      'projector:comic-shot-plan-to-storyboard',
      'projector:storyboard-to-canvas',
      'projector:storyboard-to-cut',
    ],
    tags: ['comic', 'manga', 'storyboard'],
    costLevel: 'low',
    riskLevel: 'low',
    validationRequirements: ['CompositeArtifact', 'GenericTable', 'StoryboardTable'],
    optionalTools: [TOOL_NAMES_SYSTEM.READ_IMAGE, TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE],
  },
};

export function getComicToStoryboardSkill(locale?: string): Skill {
  return localizeBuiltinSkill(comicToStoryboardSkill, localizedComicToStoryboardContent, locale);
}
