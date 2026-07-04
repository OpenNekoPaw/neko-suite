/**
 * Skill Matcher - candidate discovery only
 *
 * Matches user requests to Skill candidates based on:
 * - Keywords in skill description
 * - Skill name matching
 * - Semantic similarity (future: embeddings)
 *
 * This matcher must never apply a Skill, inject prompt text, or create Skill
 * lifecycle state. Activation is limited to explicit user invocation or the
 * Agent's `ActivateSkill` tool call after it has decided and explained why.
 */

import type { Skill, SkillMatch, ISkillMatcher } from '@neko/shared';

/**
 * Base skill matcher class
 */
export abstract class SkillMatcher implements ISkillMatcher {
  /**
   * Find skills that match the user's request
   */
  abstract match(request: string, skills: Skill[]): SkillMatch[];
}

interface RequestIntent {
  readonly contentAnalysisOnly: boolean;
  readonly hasComicDocumentSource: boolean;
  readonly hasProductionIntent: boolean;
  readonly hasStoryboardCreationIntent: boolean;
}

/**
 * Term-based candidate matcher
 *
 * Candidate scoring is based on:
 * 1. Exact skill name match
 * 2. Catalog description terms
 * 3. Keywords in description
 */
export class KeywordSkillMatcher extends SkillMatcher {
  private readonly creativeMediaWorkflowTermFragments = [
    'animation',
    'audio',
    'canvas',
    'comic',
    'creative',
    'cut',
    'export',
    'grading',
    'image',
    'manga',
    'media',
    'motion',
    'shot',
    'storyboard',
    'subtitle',
    'timeline',
    'video',
    'webtoon',
  ];

  private readonly comicDocumentSourceTermFragments = [
    'cbz',
    'cbr',
    'comic',
    'document',
    'epub',
    'image-sequence',
    'manga',
    'pdf',
    'source',
    'webtoon',
  ];

  private readonly productionTermFragments = [
    'animation',
    'assembly',
    'audio',
    'cut',
    'export',
    'generate',
    'generation',
    'image',
    'media',
    'motion',
    'timeline',
    'video',
  ];

  private readonly focusedProductionTermFragments = [
    'asset',
    'motion',
    'plan',
    'prep',
    'reference',
    'shot',
    'storyboard',
  ];

  private readonly broadOrchestrationTermFragments = [
    'coordinate',
    'coordinator',
    'handoff',
    'orchestration',
    'select-focused',
    'workflow',
  ];

  /**
   * Terms that indicate skill intent.
   * Maps common phrases to skill-related concepts.
   */
  private intentKeywords: Record<string, string[]> = {
    commit: ['commit', 'save changes', 'git commit', 'commit message', 'commit this'],
    review: ['review', 'code review', 'pr review', 'pull request', 'check code'],
    fix: ['fix', 'bug', 'error', 'issue', 'problem', 'debug'],
    refactor: ['refactor', 'improve', 'clean up', 'restructure'],
    test: ['test', 'testing', 'unit test', 'spec'],
    document: ['document', 'docs', 'documentation', 'explain', 'comment'],
  };

  private artifactKeywords: Record<string, string[]> = {
    CreativeTable: [
      'storyboard',
      'storyboard table',
      'shot list',
      'shot breakdown',
      'comic storyboard',
      'manga storyboard',
      '分镜',
      '分镜表',
      '故事板',
      '镜头表',
      '镜头拆解',
      '漫画分镜',
      '生成分镜表',
      '制作分镜表',
      '输出分镜表',
    ],
    StoryboardTable: [
      'storyboard',
      'storyboard table',
      'shot list',
      'shot breakdown',
      'comic storyboard',
      'manga storyboard',
      '分镜',
      '分镜表',
      '故事板',
      '镜头表',
      '镜头拆解',
      '漫画分镜',
      '生成分镜表',
      '制作分镜表',
      '输出分镜表',
    ],
    'storyboard-plan-overlay': [
      'animation plan',
      'motion plan',
      '动画计划',
      '运镜计划',
      '动态漫画计划',
    ],
    'cut-storyboard-payload': ['cut assembly', 'timeline assembly', '剪辑装配', '时间线装配'],
  };

  /**
   * Find skills that match the user's request
   */
  match(request: string, skills: Skill[]): SkillMatch[] {
    if (!request || skills.length === 0) {
      return [];
    }

    const requestLower = request.toLowerCase();
    const requestWords = this.tokenize(requestLower);
    const requestIntent = this.classifyRequestIntent(requestLower);
    const matches: SkillMatch[] = [];

    for (const skill of skills) {
      if (!skill.enabled) {
        continue;
      }

      const match = this.matchSkill(requestLower, requestWords, requestIntent, skill);
      if (match) {
        matches.push(match);
      }
    }

    // Sort by relevance first, then prefer focused artifact producers over broad orchestrators.
    matches.sort(
      (a, b) =>
        b.relevance - a.relevance ||
        this.getSkillSpecificityScore(b.skill) - this.getSkillSpecificityScore(a.skill),
    );

    return matches;
  }

  /**
   * Match a single skill against the request
   */
  private matchSkill(
    requestLower: string,
    requestWords: string[],
    requestIntent: RequestIntent,
    skill: Skill,
  ): SkillMatch | null {
    if (requestIntent.contentAnalysisOnly && this.isCreativeMediaWorkflowSkill(skill)) {
      return null;
    }

    let relevance = 0;
    const reasons: string[] = [];

    // 1. Exact name match (highest priority)
    if (requestLower.includes(skill.name)) {
      relevance += 0.9;
      reasons.push(`Matched skill name '${skill.name}'`);
    }

    const skillText = this.buildSkillSearchText(skill);

    // 2. Description term matching (Skills no longer have slash commands)
    const descriptionLower = skillText.toLowerCase();
    const descriptionWords = this.tokenize(descriptionLower);

    // Count matching words
    const matchingWords = requestWords.filter(
      (word) => descriptionWords.includes(word) && word.length > 2,
    );

    if (matchingWords.length > 0) {
      // Calculate relevance based on matching word ratio
      const wordMatchRatio = matchingWords.length / Math.max(requestWords.length, 1);
      relevance += wordMatchRatio * 0.6;
      reasons.push(`Matched catalog terms: ${matchingWords.join(', ')}`);
    }

    // 4. Intent term matching
    for (const [intent, keywords] of Object.entries(this.intentKeywords)) {
      const hasIntent = keywords.some((kw) => requestLower.includes(kw));
      const skillHasIntent = keywords.some((kw) => descriptionLower.includes(kw));

      if (hasIntent && skillHasIntent) {
        relevance += 0.3;
        reasons.push(`Candidate intent '${intent}'`);
        break; // Only count one intent match
      }
    }

    for (const [artifact, keywords] of Object.entries(this.artifactKeywords)) {
      if (!this.skillProducesArtifact(skill, artifact)) {
        continue;
      }

      const matchedKeyword = keywords.find((keyword) => requestLower.includes(keyword));
      if (!matchedKeyword) {
        continue;
      }

      const artifactRelevance = this.getArtifactMatchRelevance(skill, artifact);
      relevance += artifactRelevance;
      reasons.push(
        `Candidate artifact '${artifact}' via '${matchedKeyword}' (${artifactRelevance.toFixed(2)})`,
      );
      break;
    }

    const mediaIntentRelevance = this.getMediaIntentMatchRelevance(skill, requestIntent);
    if (mediaIntentRelevance > 0) {
      relevance += mediaIntentRelevance;
      reasons.push(`Matched media production intent (${mediaIntentRelevance.toFixed(2)})`);
    }

    // Only return if relevance is above threshold
    if (relevance > 0.1) {
      return {
        skill,
        relevance: Math.min(relevance, 1), // Cap at 1.0
        reason: reasons.join('; '),
      };
    }

    return null;
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .split(/[\s.,!?;:'"()[\]{}]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
  }

  private classifyRequestIntent(requestLower: string): RequestIntent {
    const hasConceptualQuestionIntent = this.containsAny(requestLower, [
      '是否',
      '能否',
      '为什么',
      '区别',
      '是什么',
      '需要吗',
      '是否需要',
      '有必要',
      '应该',
      '适合',
      'what is',
      'why',
      'whether',
      'should',
      'difference',
      'compare',
    ]);
    const hasContentAnalysisIntent =
      hasConceptualQuestionIntent ||
      this.containsAny(requestLower, [
        '分析',
        '解析',
        '总结',
        '概括',
        '说明',
        '描述',
        '看看',
        '查看',
        '识别',
        '提取',
        '提取文字',
        '阅读',
        '读一下',
        '前10页',
        '前 10 页',
        '前十页',
        '前几页',
        'ocr',
        'analyze',
        'analyse',
        'describe',
        'summarize',
        'summary',
        'extract text',
        'read',
        'inspect',
        'understand',
        'explain',
      ]);
    const hasStoryboardKeyword = this.containsAny(requestLower, [
      '生成分镜表',
      '制作分镜表',
      '输出分镜表',
      '创建分镜表',
      '建立分镜表',
      '做分镜表',
      '转成分镜表',
      '转为分镜表',
      '拆分镜',
      '镜头拆解',
      'storyboard table',
      'create storyboard',
      'generate storyboard',
      'make storyboard',
      'shot breakdown',
    ]);
    const hasProductionKeyword = this.containsAny(requestLower, [
      '生成视频',
      '生成动画',
      '转动画',
      '转视频',
      '转成动画',
      '转成视频',
      '转为动画',
      '转为视频',
      '做成动画',
      '做成视频',
      '制作动画',
      '制作视频',
      '动态漫画',
      '动画化',
      '视频化',
      '批量处理',
      '批处理',
      '去字',
      '去除文字',
      '移除文字',
      '补全',
      '上色',
      '扩图',
      '导出',
      '剪辑装配',
      '时间线装配',
      'canvas',
      'cut handoff',
      'cut assembly',
      'generate video',
      'generate animation',
      'create video',
      'make video',
      'animate',
      'animation',
      'video production',
      'image prep',
      'asset prep',
      'inpaint',
      'outpaint',
      'colorize',
      'upscale',
      'export',
      'timeline',
      'assembly',
    ]);
    const hasComicDocumentSource = this.containsAny(requestLower, [
      'epub',
      'pdf',
      'cbz',
      'cbr',
      '漫画',
      '日漫',
      'manga',
      'comic',
      'webtoon',
      '卷',
    ]);
    const hasStoryboardCreationIntent = hasStoryboardKeyword && !hasConceptualQuestionIntent;
    const hasProductionIntent = hasProductionKeyword && !hasConceptualQuestionIntent;

    return {
      contentAnalysisOnly:
        hasContentAnalysisIntent && !hasStoryboardCreationIntent && !hasProductionIntent,
      hasComicDocumentSource,
      hasProductionIntent,
      hasStoryboardCreationIntent,
    };
  }

  private buildSkillSearchText(skill: Skill): string {
    return [
      skill.name,
      skill.description,
      skill.domain,
      ...(skill.mediaWorkflow?.producedArtifacts ?? []),
      ...(skill.mediaWorkflow?.inputArtifacts ?? []),
      ...(skill.mediaWorkflow?.tags ?? []),
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' ');
  }

  private skillProducesArtifact(skill: Skill, artifact: string): boolean {
    return this.getProducedArtifactAliases(skill).includes(artifact);
  }

  private getArtifactMatchRelevance(skill: Skill, artifact: string): number {
    const producedArtifacts = this.getProducedArtifactAliases(skill);
    if (!producedArtifacts.includes(artifact)) {
      return 0;
    }

    return producedArtifacts.length === 1 ? 0.95 : 0.85;
  }

  private getMediaIntentMatchRelevance(skill: Skill, intent: RequestIntent): number {
    if (!intent.hasProductionIntent) {
      return 0;
    }

    if (!this.isCreativeMediaWorkflowSkill(skill)) {
      return 0;
    }

    if (!this.hasWorkflowTermFragment(skill, this.productionTermFragments)) {
      return 0;
    }

    let relevance = 0;

    if (
      intent.hasComicDocumentSource &&
      this.hasWorkflowTermFragment(skill, this.comicDocumentSourceTermFragments)
    ) {
      relevance += 0.45;
    }

    relevance += 0.35;

    if (this.hasWorkflowTermFragment(skill, this.focusedProductionTermFragments)) {
      relevance += 0.15;
    }

    if (this.hasWorkflowTermFragment(skill, this.broadOrchestrationTermFragments)) {
      relevance -= 0.15;
    }

    return Math.max(0, Math.min(relevance, 0.97));
  }

  private getSkillSpecificityScore(skill: Skill): number {
    const producedArtifacts = skill.mediaWorkflow?.producedArtifacts ?? [];
    return producedArtifacts.length > 0 ? 1 / producedArtifacts.length : 0;
  }

  private getProducedArtifactAliases(skill: Skill): readonly string[] {
    return (skill.mediaWorkflow?.producedArtifacts ?? []).flatMap((artifact) =>
      artifact === 'storyboard-table' ? ['StoryboardTable'] : [artifact],
    );
  }

  private isCreativeMediaWorkflowSkill(skill: Skill): boolean {
    return this.hasWorkflowTermFragment(skill, this.creativeMediaWorkflowTermFragments);
  }

  private hasWorkflowTermFragment(skill: Skill, fragments: readonly string[]): boolean {
    const workflowTerms = this.getWorkflowTerms(skill);
    return workflowTerms.some((term) => fragments.some((fragment) => term.includes(fragment)));
  }

  private getWorkflowTerms(skill: Skill): readonly string[] {
    const mediaWorkflow = skill.mediaWorkflow;
    if (!mediaWorkflow) {
      return [];
    }

    return [
      skill.domain,
      ...(mediaWorkflow.useCases ?? []),
      ...(mediaWorkflow.acceptedModalities ?? []),
      ...(mediaWorkflow.producedArtifacts ?? []),
      ...(mediaWorkflow.artifactProfiles ?? []),
      ...(mediaWorkflow.inputArtifacts ?? []),
      ...(mediaWorkflow.referencedCapabilities ?? []),
      ...(mediaWorkflow.suggestedProjectors ?? []),
      ...(mediaWorkflow.tags ?? []),
      ...(mediaWorkflow.operations ?? []),
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map((value) => value.toLowerCase());
  }

  private containsAny(text: string, keywords: readonly string[]): boolean {
    return keywords.some((keyword) => text.includes(keyword));
  }
}

/**
 * Create a default skill matcher
 */
export function createDefaultMatcher(): ISkillMatcher {
  return new KeywordSkillMatcher();
}
