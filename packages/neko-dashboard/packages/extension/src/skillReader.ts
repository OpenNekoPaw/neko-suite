import * as vscode from 'vscode';
import { NEKO_EXTENSION_IDS, type ISkillProvider } from '@neko/shared';
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
          skills.push({
            id: def.id,
            extensionId,
            name: def.name,
            description: def.description,
            icon: def.icon,
            command: def.command,
            tags: def.tags,
          });
        }
      } catch {
        continue;
      }
    }

    return skills;
  }
}
