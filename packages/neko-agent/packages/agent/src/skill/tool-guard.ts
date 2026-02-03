/**
 * Tool Guard - Runtime enforcement of allowed-tools restrictions
 *
 * When a Skill specifies allowed-tools, this guard ensures that
 * only those tools can be used during skill execution.
 */

import { isToolAllowed } from '@uniedit/shared';

/**
 * Tool call input for guard checking
 * Minimal format containing only what's needed for permission checks
 */
export interface ToolCallInput {
  /** Tool name */
  name: string;
  /** Tool arguments */
  arguments?: Record<string, unknown>;
}

/**
 * Tool guard result
 */
export interface ToolGuardResult {
  /** Whether the tool call is allowed */
  allowed: boolean;
  /** Reason if blocked */
  reason?: string;
  /** The original tool call */
  toolCall: ToolCallInput;
}

/**
 * Tool guard interface
 */
export interface IToolGuard {
  /**
   * Check if a tool call is allowed
   */
  check(toolCall: ToolCallInput): ToolGuardResult;

  /**
   * Check multiple tool calls
   */
  checkAll(toolCalls: ToolCallInput[]): ToolGuardResult[];

  /**
   * Get the list of allowed tools
   */
  getAllowedTools(): string[] | undefined;

  /**
   * Check if restrictions are active
   */
  hasRestrictions(): boolean;
}

/**
 * Tool Guard implementation
 */
export class ToolGuard implements IToolGuard {
  private allowedTools?: string[];
  private skillName?: string;

  constructor(allowedTools?: string[], skillName?: string) {
    this.allowedTools = allowedTools;
    this.skillName = skillName;
  }

  /**
   * Check if a tool call is allowed
   */
  check(toolCall: ToolCallInput): ToolGuardResult {
    // No restrictions = all allowed
    if (!this.hasRestrictions()) {
      return {
        allowed: true,
        toolCall,
      };
    }

    // Normalize tool name for Bash commands
    const toolName = this.normalizeToolName(toolCall);

    // Check against allowed list
    const allowed = isToolAllowed(toolName, this.allowedTools);

    if (allowed) {
      return {
        allowed: true,
        toolCall,
      };
    }

    // Build rejection reason
    const reason = this.buildRejectionReason(toolName);

    return {
      allowed: false,
      reason,
      toolCall,
    };
  }

  /**
   * Check multiple tool calls
   */
  checkAll(toolCalls: ToolCallInput[]): ToolGuardResult[] {
    return toolCalls.map((tc) => this.check(tc));
  }

  /**
   * Get the list of allowed tools
   */
  getAllowedTools(): string[] | undefined {
    return this.allowedTools;
  }

  /**
   * Check if restrictions are active
   */
  hasRestrictions(): boolean {
    return this.allowedTools !== undefined && this.allowedTools.length > 0;
  }

  /**
   * Normalize tool name for comparison
   *
   * For Bash commands, we need to extract the command being run
   * e.g., Bash with command "git status" → "Bash(git status)"
   */
  private normalizeToolName(toolCall: ToolCallInput): string {
    const { name, arguments: args } = toolCall;

    // Handle Bash tool specially
    if (name === 'Bash' && args?.command) {
      const command = String(args.command);
      return `Bash(${command})`;
    }

    return name;
  }

  /**
   * Build a human-readable rejection reason
   */
  private buildRejectionReason(toolName: string): string {
    const skillContext = this.skillName ? ` by skill '${this.skillName}'` : '';
    const allowedList = this.allowedTools?.join(', ') || 'none';

    return `Tool '${toolName}' is not allowed${skillContext}. Allowed tools: ${allowedList}`;
  }
}

/**
 * Create a tool guard from skill injection
 */
export function createToolGuard(
  allowedTools?: string[],
  skillName?: string
): ToolGuard {
  return new ToolGuard(allowedTools, skillName);
}

/**
 * No-op tool guard that allows everything
 */
export class NoOpToolGuard implements IToolGuard {
  check(toolCall: ToolCallInput): ToolGuardResult {
    return { allowed: true, toolCall };
  }

  checkAll(toolCalls: ToolCallInput[]): ToolGuardResult[] {
    return toolCalls.map((tc) => ({ allowed: true, toolCall: tc }));
  }

  getAllowedTools(): string[] | undefined {
    return undefined;
  }

  hasRestrictions(): boolean {
    return false;
  }
}
