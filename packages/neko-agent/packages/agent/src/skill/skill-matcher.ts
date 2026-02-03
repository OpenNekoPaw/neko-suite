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

    // Sort by relevance (highest first)
    matches.sort((a, b) => b.relevance - a.relevance);

    return matches;
  }

  /**
   * Match a single skill against the request
   */
  private matchSkill(requestLower: string, requestWords: string[], skill: Skill): SkillMatch | null {
    let relevance = 0;
    const reasons: string[] = [];

    // 1. Exact name match (highest priority)
    if (requestLower.includes(skill.name)) {
      relevance += 0.9;
      reasons.push(`Matched skill name '${skill.name}'`);
    }

    // 2. Description keyword matching (Skills no longer have slash commands)
    const descriptionLower = skill.description.toLowerCase();
    const descriptionWords = this.tokenize(descriptionLower);

    // Count matching words
    const matchingWords = requestWords.filter((word) => descriptionWords.includes(word) && word.length > 2);

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
      .split(/[\s.,!?;:'"()\[\]{}]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
  }
}

/**
 * Create a default skill matcher
 */
export function createDefaultMatcher(): ISkillMatcher {
  return new KeywordSkillMatcher();
}
