/**
 * Skill matcher for candidate discovery only.
 *
 * Core matching is intentionally domain-neutral. It compares the request with
 * registered Skill identity and catalog text; it never embeds domain
 * vocabularies, activates a Skill, or creates lifecycle state.
 */

import type { ISkillMatcher, Skill, SkillMatch } from '@neko/shared';

export abstract class SkillMatcher implements ISkillMatcher {
  abstract match(request: string, skills: Skill[]): SkillMatch[];
}

export class KeywordSkillMatcher extends SkillMatcher {
  match(request: string, skills: Skill[]): SkillMatch[] {
    const normalizedRequest = normalizeSearchText(request);
    if (normalizedRequest.length === 0 || skills.length === 0) return [];

    const requestTerms = tokenize(normalizedRequest);
    return skills
      .filter((skill) => skill.enabled)
      .flatMap((skill) => {
        const match = this.matchSkill(normalizedRequest, requestTerms, skill);
        return match ? [match] : [];
      })
      .sort(
        (left, right) =>
          right.relevance - left.relevance || left.skill.name.localeCompare(right.skill.name),
      );
  }

  private matchSkill(
    normalizedRequest: string,
    requestTerms: ReadonlySet<string>,
    skill: Skill,
  ): SkillMatch | null {
    const reasons: string[] = [];
    let relevance = 0;
    const normalizedName = normalizeSearchText(skill.name);

    if (normalizedName.length > 0 && normalizedRequest.includes(normalizedName)) {
      relevance += 0.9;
      reasons.push(`Matched registered Skill name '${skill.name}'`);
    }

    const catalogText = normalizeSearchText(
      [
        skill.name,
        skill.description,
        skill.portableDefinition?.description,
        skill.nekoOverlay?.interface?.displayName,
        skill.nekoOverlay?.interface?.shortDescription,
      ]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(' '),
    );
    const catalogTerms = tokenize(catalogText);
    const matchingTerms = [...requestTerms].filter((term) => catalogTerms.has(term));
    if (matchingTerms.length > 0) {
      const overlap = matchingTerms.length / Math.max(1, Math.min(requestTerms.size, 12));
      relevance += Math.min(0.7, overlap * 0.7);
      reasons.push(`Matched registered catalog terms: ${matchingTerms.slice(0, 8).join(', ')}`);
    }

    if (relevance <= 0.1) return null;
    return {
      skill,
      relevance: Math.min(1, relevance),
      reason: reasons.join('; '),
    };
  }
}

export function createDefaultMatcher(): ISkillMatcher {
  return new KeywordSkillMatcher();
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function tokenize(value: string): ReadonlySet<string> {
  const terms = new Set<string>();
  for (const token of value.match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (containsCjk(token)) {
      addCjkNgrams(token, terms);
      continue;
    }
    if (token.length >= 2) terms.add(token);
  }
  return terms;
}

function containsCjk(value: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(value);
}

function addCjkNgrams(value: string, terms: Set<string>): void {
  const characters = [...value];
  for (const size of [2, 3, 4]) {
    for (let index = 0; index + size <= characters.length; index += 1) {
      terms.add(characters.slice(index, index + size).join(''));
    }
  }
}
