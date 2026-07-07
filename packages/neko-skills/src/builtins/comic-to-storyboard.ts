/**
 * Comic to Storyboard Skill - Convert manga/comic pages to reviewable creative tables
 *
 * Provides comic panel analysis, OCR, shot-local character cues, and Markdown creative table output.
 * Triggered when user explicitly asks for a comic storyboard or shot breakdown.
 */

import type { Skill } from '@neko/shared';
import { TOOL_NAMES_SYSTEM } from '@neko/shared';
import { localizeBuiltinSkill, normalizeBuiltinSkillLocale } from './builtin-skill-content';
import comicToStoryboardContent from './markdown/comic-to-storyboard.md?raw';
import comicToStoryboardZhCnContent from './markdown/comic-to-storyboard.zh-cn.md?raw';

const localizedComicToStoryboardContent = {
  default: comicToStoryboardContent,
  localized: {
    'zh-cn': comicToStoryboardZhCnContent,
  },
};

/**
 * Comic to Storyboard skill - Convert manga/comic pages to reviewable creative tables
 *
 * Triggered when user explicitly asks for a comic storyboard or shot breakdown.
 */
export const comicToStoryboardSkill: Skill = {
  name: 'comic-to-storyboard',
  description:
    'Convert manga/comic pages into reviewable Markdown creative tables with prompts, resource tokens, and next actions. ' +
    'Use after the Agent has understood the request and confirmed a comic storyboard artifact, shot breakdown, ' +
    'comic adaptation storyboard, or webtoon storyboard is needed; not for content-only EPUB/comic analysis.',
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
      'Create a reviewable Markdown creative table from comic, manga, webtoon, PDF, or image pages',
      'Convert panel analysis and OCR evidence into a Markdown storyboard table with prompts, resource tokens, and next actions',
      'Build a shot breakdown for comic adaptation before animation or Cut handoff',
    ],
    nonGoals: [
      'Analyze, summarize, OCR, describe, or read comic pages without creating a storyboard artifact',
      'Generate images, videos, audio, Canvas scenes, or Cut timelines directly',
      'Create project entity memory or character identity records',
    ],
    acceptedModalities: ['comic', 'document', 'image-sequence'],
    inputArtifacts: ['comic', 'manga', 'webtoon', 'PDF', 'image-sequence', 'MediaTextSegment'],
    producedArtifacts: ['CreativeTable'],
    artifactProfiles: ['storyboard'],
    referencedCapabilities: ['canvas.authoring'],
    tags: ['comic', 'manga', 'storyboard'],
    operations: ['create-storyboard', 'shot-breakdown', 'panel-analysis', 'ocr-to-storyboard'],
    costLevel: 'low',
    riskLevel: 'low',
    validationRequirements: ['CreativeTable'],
    optionalTools: [TOOL_NAMES_SYSTEM.READ_IMAGE, TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE],
  },
};

export function getComicToStoryboardSkill(locale?: string): Skill {
  const skill = localizeBuiltinSkill(
    comicToStoryboardSkill,
    localizedComicToStoryboardContent,
    locale,
  );
  if (normalizeBuiltinSkillLocale(locale) !== 'zh-cn') {
    return skill;
  }

  return {
    ...skill,
    description:
      '将漫画、日漫、webtoon、PDF、EPUB、CBZ/CBR 页面或图片序列转换成可审阅的 Markdown 分镜 creative table。' +
      '仅在 Agent 已理解请求并确认需要分镜表、镜头拆解、漫画改编表或 webtoon 分镜产物后使用；不用于纯内容分析。',
  };
}
