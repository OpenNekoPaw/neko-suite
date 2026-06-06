/**
 * Skill Matcher - Semantic matching for skill discovery
 *
 * Matches user requests to skills based on:
 * - Keywords in skill description
 * - Skill name matching
 * - Semantic similarity (future: embeddings)
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

/**
 * Keyword-based skill matcher
 *
 * Matches based on:
 * 1. Exact skill name match
 * 2. Slash command match
 * 3. Keywords in description
 */
export class KeywordSkillMatcher extends SkillMatcher {
  /**
   * Keywords that indicate skill intent
   * Maps common phrases to skill-related concepts
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
    'animation-plan': ['animation plan', 'motion plan', '动画计划', '运镜计划', '动态漫画计划'],
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
    const matches: SkillMatch[] = [];

    for (const skill of skills) {
      if (!skill.enabled) {
        continue;
      }

      const match = this.matchSkill(requestLower, requestWords, skill);
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
    skill: Skill,
  ): SkillMatch | null {
    let relevance = 0;
    const reasons: string[] = [];

    // 1. Exact name match (highest priority)
    if (requestLower.includes(skill.name)) {
      relevance += 0.9;
      reasons.push(`Matched skill name '${skill.name}'`);
    }

    const skillText = this.buildSkillSearchText(skill);

    // 2. Description keyword matching (Skills no longer have slash commands)
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
      reasons.push(`Matched keywords: ${matchingWords.join(', ')}`);
    }

    // 4. Intent keyword matching
    for (const [intent, keywords] of Object.entries(this.intentKeywords)) {
      const hasIntent = keywords.some((kw) => requestLower.includes(kw));
      const skillHasIntent = keywords.some((kw) => descriptionLower.includes(kw));

      if (hasIntent && skillHasIntent) {
        relevance += 0.3;
        reasons.push(`Matched intent '${intent}'`);
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
        `Matched artifact '${artifact}' via '${matchedKeyword}' (${artifactRelevance.toFixed(2)})`,
      );
      break;
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

  private getSkillSpecificityScore(skill: Skill): number {
    const producedArtifacts = skill.mediaWorkflow?.producedArtifacts ?? [];
    return producedArtifacts.length > 0 ? 1 / producedArtifacts.length : 0;
  }

  private getProducedArtifactAliases(skill: Skill): readonly string[] {
    return (skill.mediaWorkflow?.producedArtifacts ?? []).flatMap((artifact) =>
      artifact === 'storyboard-table' ? ['StoryboardTable'] : [artifact],
    );
  }
}

/**
 * Create a default skill matcher
 */
export function createDefaultMatcher(): ISkillMatcher {
  return new KeywordSkillMatcher();
}
