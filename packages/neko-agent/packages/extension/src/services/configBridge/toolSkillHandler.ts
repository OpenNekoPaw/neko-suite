/**
 * ToolSkillHandler - ToolSkill registration and enabled state management
 */

import type * as vscode from 'vscode';
import type { ConfiguredToolGroup } from '@neko/shared';
import {
  TOOL_SKILL_ENABLED_STATE_STORAGE_KEY,
  buildToolSkillConfigDataMessage,
  createEnabledStateRuntimeStore,
  createToolSkillConfigSyncRuntime,
  type ToolSkillConfigSyncRuntime,
} from '@neko/agent/runtime';
import type { PostMessageFn } from './types';
import { createVSCodeEnabledStateStorage } from './enabledStateStore';
import { broadcastToWebviews } from './broadcastHelper';
import { getLogger } from '../../base';

const logger = getLogger('ToolSkillHandler');

export class ToolSkillHandler {
  private readonly runtime: ToolSkillConfigSyncRuntime;

  constructor(
    private readonly activeWebviews: Set<PostMessageFn>,
    context?: vscode.ExtensionContext,
  ) {
    this.runtime = createToolSkillConfigSyncRuntime({
      enabledState: createEnabledStateRuntimeStore({
        storageKey: TOOL_SKILL_ENABLED_STATE_STORAGE_KEY,
        storage: createVSCodeEnabledStateStorage(context),
        logger,
      }),
    });
  }

  /**
   * Set ToolSkills from ToolSkillRegistry (called by AgentRunner after initialization)
   */
  setToolSkills(toolSkills: ConfiguredToolGroup[]): void {
    this.runtime.setToolSkills(toolSkills);
  }

  getToolSkills(): ConfiguredToolGroup[] {
    return this.runtime.getToolSkills();
  }

  /**
   * Broadcast current ToolSkills state to all webviews
   */
  broadcast(): void {
    broadcastToWebviews(
      this.activeWebviews,
      buildToolSkillConfigDataMessage(this.runtime.getToolSkills()),
    );
  }
}
