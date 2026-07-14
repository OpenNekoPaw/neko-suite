import * as vscode from 'vscode';
import {
  NEKO_EXTENSION_IDS,
  toSkillCatalogMeta,
  type ISkillProvider,
  type SkillDef,
  type SkillLocalizedText,
} from '@neko/shared';
import type { DashboardSkill } from './protocol';

const SKILL_PROVIDER_EXTENSION_IDS: readonly string[] = [
  NEKO_EXTENSION_IDS.NEKO_CUT,
  NEKO_EXTENSION_IDS.NEKO_CANVAS,
  NEKO_EXTENSION_IDS.NEKO_STORY,
  NEKO_EXTENSION_IDS.NEKO_SKETCH,
  NEKO_EXTENSION_IDS.NEKO_AUTH,
  NEKO_EXTENSION_IDS.NEKO_AGENT,
];

export class SkillReader {
  async read(): Promise<readonly DashboardSkill[]> {
    const skills: DashboardSkill[] = [];
    const locale = normalizeSkillLocale(vscode.env.language);

    for (const extensionId of SKILL_PROVIDER_EXTENSION_IDS) {
      const extension = vscode.extensions.getExtension<ISkillProvider>(extensionId);
      if (!extension) continue;

      let api: ISkillProvider;
      try {
        api = extension.isActive ? extension.exports : await extension.activate();
      } catch {
        continue;
      }

      if (typeof api?.getSkills !== 'function') continue;

      try {
        for (const def of api.getSkills()) {
          const skill = toDashboardSkill(def, extensionId, locale);
          if (isInstalledDashboardSkill(skill)) {
            skills.push(skill);
          }
        }
      } catch {
        continue;
      }
    }

    return skills;
  }
}

function isInstalledDashboardSkill(skill: DashboardSkill): boolean {
  return (
    skill.catalog.visibility !== 'hidden' &&
    skill.catalog.role !== 'quick-action' &&
    skill.catalog.role !== 'persona'
  );
}

function toDashboardSkill(def: SkillDef, extensionId: string, locale: string): DashboardSkill {
  const localized = resolveSkillLocale(def, locale);
  return {
    id: def.id,
    extensionId,
    name: localized.name ?? def.name,
    description: localized.description ?? def.description,
    locale,
    icon: def.icon,
    command: def.command,
    tags: localized.tags ?? def.tags,
    catalog:
      def.catalog ??
      toSkillCatalogMeta(
        {
          name: def.id,
          description: def.description,
          icon: def.icon,
          tags: def.tags,
        },
        {
          defaultSource: extensionId === NEKO_EXTENSION_IDS.NEKO_AGENT ? 'builtin' : 'plugin',
          defaultRole:
            extensionId === NEKO_EXTENSION_IDS.NEKO_AGENT ? 'standalone' : 'quick-action',
          defaultVisibility: 'primary',
        },
      ),
  };
}

function resolveSkillLocale(def: SkillDef, locale: string): SkillLocalizedText {
  const locales = def.locales;
  if (!locales) return {};

  for (const key of createLocaleFallbacks(locale)) {
    const candidate = locales[key];
    if (candidate) return candidate;
  }
  return {};
}

function createLocaleFallbacks(locale: string): readonly string[] {
  const normalized = normalizeSkillLocale(locale);
  const language = normalized.split('-')[0];
  return language && language !== normalized ? [normalized, language] : [normalized];
}

function normalizeSkillLocale(locale: string | undefined): string {
  const normalized = locale?.trim().toLowerCase().replace(/_/g, '-');
  return normalized && normalized.length > 0 ? normalized : 'en';
}
