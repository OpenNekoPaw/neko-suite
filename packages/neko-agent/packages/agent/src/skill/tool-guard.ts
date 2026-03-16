/**
 * Tool Guard - Runtime enforcement of allowed-tools restrictions
 *
 * When a Skill specifies allowed-tools, this guard ensures that
 * only those tools can be used during skill execution.
 */

import { normalizeToolCall, isInPatternList } from '../tools/tool-pattern-matcher';

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

    // Normalize tool call to canonical string format (e.g., "Bash(git status)", "Read(src/file.ts)")
    const normalized = normalizeToolCall(toolCall);

    // Check against allowed list using unified pattern matching
    const matched = isInPatternList(normalized, this.allowedTools);

    if (matched !== undefined) {
      return {
        allowed: true,
        toolCall,
      };
    }

    // Build rejection reason
    const reason = this.buildRejectionReason(normalized);

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
export function createToolGuard(allowedTools?: string[], skillName?: string): ToolGuard {
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
