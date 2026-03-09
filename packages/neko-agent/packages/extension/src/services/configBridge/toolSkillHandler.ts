/**
 * ToolSkillHandler - ToolSkill registration and enabled state management
 */

import type * as vscode from 'vscode';
import type { ConfiguredToolGroup } from '@neko/shared';
import type { PostMessageFn } from './types';
import { EnabledStateStore } from './enabledStateStore';
import { broadcastToWebviews } from './broadcastHelper';

const TOOL_SKILL_ENABLED_STATE_KEY = 'toolSkillEnabledState';

export class ToolSkillHandler {
  private cachedToolSkills: ConfiguredToolGroup[] = [];
  private readonly enabledState: EnabledStateStore;

  constructor(
    private readonly activeWebviews: Set<PostMessageFn>,
    context?: vscode.ExtensionContext,
  ) {
    this.enabledState = new EnabledStateStore(TOOL_SKILL_ENABLED_STATE_KEY, context);
  }

  /**
   * Set ToolSkills from ToolSkillRegistry (called by AgentRunner after initialization)
   */
  setToolSkills(toolSkills: ConfiguredToolGroup[]): void {
    this.cachedToolSkills = this.enabledState.applyTo(toolSkills, (ts) => ts.name);
  }

  getToolSkills(): ConfiguredToolGroup[] {
    return this.cachedToolSkills;
  }

  /**
   * Broadcast current ToolSkills state to all webviews
   */
  broadcast(): void {
    broadcastToWebviews(this.activeWebviews, {
      type: 'toolSkillsChanged',
      toolSkills: this.cachedToolSkills,
    });
  }
}
