/**
 * Permission Rule Matcher
 *
 * Matches tool calls against permission rules (deny/allow/ask).
 * Reuses pattern matching logic from skill/types.ts isToolAllowed().
 *
 * Pattern syntax:
 * - "Read" - Exact tool name
 * - "Bash(npm:*)" - Bash command prefix (npm run build, npm test, etc.)
 * - "Bash(git status)" - Exact bash command
 * - "Read(src/**)" - Path pattern with glob
 */

import type { ToolCallInfo } from '@neko/shared';
import type {
  PermissionRules,
  PermissionDecision,
  PermissionCheckResult,
  PermissionConfig,
} from './types';
import { DEFAULT_READ_ONLY_TOOLS, READ_ONLY_MCP_PREFIXES, PLAN_FILE_PATH } from './types';

/**
 * Normalize tool call to string format for matching
 *
 * @example
 * { name: 'Bash', arguments: { command: 'git status' } } → 'Bash(git status)'
 * { name: 'Read', arguments: { path: 'src/index.ts' } } → 'Read(src/index.ts)'
 */
export function normalizeToolCall(toolCall: ToolCallInfo): string {
  const { name, arguments: args } = toolCall;

  // Handle Bash tool - extract command
  if (name === 'Bash' && args?.command) {
    return `Bash(${String(args.command)})`;
  }

  // Handle Read/Edit/Write tools - extract path
  if (['Read', 'Edit', 'Write', 'Glob', 'Grep'].includes(name)) {
    const path = args?.file_path || args?.path || args?.pattern;
    if (path) {
      return `${name}(${String(path)})`;
    }
  }

  // Handle WebFetch - extract domain
  if (name === 'WebFetch' && args?.url) {
    try {
      const url = new URL(String(args.url));
      return `WebFetch(domain:${url.hostname})`;
    } catch {
      return `WebFetch(${String(args.url)})`;
    }
  }

  // Handle MCP tools
  if (name.startsWith('mcp__')) {
    return name;
  }

  return name;
}

/**
 * Check if a normalized tool string matches a pattern
 *
 * Pattern formats:
 * - "Bash" - Match all Bash calls
 * - "Bash(npm:*)" - Match Bash commands starting with "npm"
 * - "Bash(git status)" - Exact match
 * - "Read(src/**)" - Path glob pattern
 * - "WebFetch(domain:github.com)" - Domain match
 */
export function matchesPattern(normalizedTool: string, pattern: string): boolean {
  // Exact match
  if (pattern === normalizedTool) {
    return true;
  }

  // Tool name only match (e.g., "Bash" matches all Bash calls)
  const toolName = normalizedTool.split('(')[0];
  if (pattern === toolName) {
    return true;
  }

  // Pattern with arguments
  const patternMatch = pattern.match(/^(\w+)\((.+)\)$/);
  const toolMatch = normalizedTool.match(/^(\w+)\((.+)\)$/);

  if (!patternMatch || !toolMatch) {
    return false;
  }

  const [, patternTool, patternArg] = patternMatch;
  const [, callTool, callArg] = toolMatch;

  // Tool name must match
  if (patternTool !== callTool) {
    return false;
  }

  // Handle domain matching for WebFetch
  if (patternArg?.startsWith('domain:') && callArg?.startsWith('domain:')) {
    const patternDomain = patternArg.slice(7);
    const callDomain = callArg.slice(7);

    // Wildcard domain match (*.github.com)
    if (patternDomain.startsWith('*.')) {
      const suffix = patternDomain.slice(1); // .github.com
      return callDomain.endsWith(suffix) || callDomain === patternDomain.slice(2);
    }

    return patternDomain === callDomain;
  }

  // Handle command prefix match (npm:* or git:*)
  if (patternArg?.endsWith(':*')) {
    const cmdPrefix = patternArg.slice(0, -2);
    // Match "npm" or "npm run build" etc.
    return callArg === cmdPrefix || callArg?.startsWith(cmdPrefix + ' ');
  }

  // Handle ** glob pattern for paths (check before single * to avoid early match)
  if (patternArg?.includes('**')) {
    // Use placeholder to avoid double replacement
    const regex = patternArg
      .replace(/\*\*/g, '\x00DOUBLE_STAR\x00') // Placeholder for **
      .replace(/\*/g, '[^/]*') // Single * matches non-slash chars
      .replace(/\x00DOUBLE_STAR\x00/g, '.*') // ** matches everything
      .replace(/\//g, '\\/'); // Escape slashes
    try {
      return new RegExp(`^${regex}$`).test(callArg || '');
    } catch {
      return false;
    }
  }

  // Handle glob-style wildcard match (single *)
  if (patternArg?.endsWith('*')) {
    const prefix = patternArg.slice(0, -1);
    return callArg?.startsWith(prefix) || false;
  }

  // Exact argument match
  return patternArg === callArg;
}

/**
 * Check if tool is in a list of patterns
 */
export function isInPatternList(normalizedTool: string, patterns?: string[]): string | undefined {
  if (!patterns || patterns.length === 0) {
    return undefined;
  }

  for (const pattern of patterns) {
    if (matchesPattern(normalizedTool, pattern)) {
      return pattern;
    }
  }

  return undefined;
}

/**
 * Check if a tool call is writing to the plan file
 * In plan mode, Write/Edit to the plan file is allowed
 */
export function isPlanFileWrite(toolCall: ToolCallInfo): boolean {
  const { name, arguments: args } = toolCall;

  // Only Write and Edit tools can write to files
  if (name !== 'Write' && name !== 'Edit') {
    return false;
  }

  // Get the file path from arguments
  const filePath = args?.file_path || args?.path;
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  // Check if the path ends with the plan file path
  // Only match the canonical .neko/plan.md path, not arbitrary *plan.md files
  return filePath.endsWith(PLAN_FILE_PATH);
}

/**
 * Check if a tool is read-only
 *
 * A tool is considered read-only if:
 * 1. It's in the readOnlyTools list (e.g., 'Read', 'Glob', 'Grep')
 * 2. It's an MCP tool with a read-only prefix (e.g., 'mcp__serena__find_symbol')
 */
export function isReadOnlyTool(
  toolCall: ToolCallInfo,
  readOnlyTools: string[] = DEFAULT_READ_ONLY_TOOLS,
  readOnlyMcpPrefixes: string[] = READ_ONLY_MCP_PREFIXES,
): boolean {
  const { name } = toolCall;

  // Check if in read-only tools list
  if (readOnlyTools.includes(name)) {
    return true;
  }

  // Check MCP tools with read-only prefixes
  // Format: mcp__<server>__<tool_name>
  if (name.startsWith('mcp__')) {
    // Extract the actual tool name (last part after the server name)
    const parts = name.split('__');
    if (parts.length >= 3) {
      const mcpToolName = parts.slice(2).join('__'); // Handle nested names
      // Check if the tool name starts with a read-only prefix
      for (const prefix of readOnlyMcpPrefixes) {
        if (mcpToolName.startsWith(prefix)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Permission Rule Matcher class
 *
 * Evaluates tool calls against permission rules in order:
 * 1. deny - If matched, immediately deny
 * 2. allow - If matched, allow without confirmation
 * 3. ask - If matched, require confirmation
 * 4. mode check - Apply execution mode rules
 */
export class PermissionRuleMatcher {
  private config: PermissionConfig;

  constructor(config: PermissionConfig) {
    this.config = config;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PermissionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current mode
   */
  getMode(): string {
    return this.config.mode;
  }

  /**
   * Check permission for a tool call
   */
  check(toolCall: ToolCallInfo): PermissionCheckResult {
    const normalizedTool = normalizeToolCall(toolCall);
    const { rules, mode, readOnlyTools, readOnlyMcpPrefixes } = this.config;

    // Step 1: Check deny rules (highest priority)
    const denyMatch = isInPatternList(normalizedTool, rules.deny);
    if (denyMatch) {
      return {
        decision: 'deny',
        reason: `Tool '${normalizedTool}' is denied by rule '${denyMatch}'`,
        matchedRule: denyMatch,
        toolCall,
      };
    }

    // Step 2: Plan mode - only allow read-only tools + plan file writes
    if (mode === 'plan') {
      // Allow read-only tools
      if (isReadOnlyTool(toolCall, readOnlyTools, readOnlyMcpPrefixes)) {
        return {
          decision: 'allow',
          reason: `Read-only tool allowed in plan mode`,
          toolCall,
        };
      }

      // Allow writing to the plan file (Claude Code compatible)
      if (isPlanFileWrite(toolCall)) {
        return {
          decision: 'allow',
          reason: `Writing to plan file (${PLAN_FILE_PATH}) allowed in plan mode`,
          toolCall,
        };
      }

      return {
        decision: 'deny',
        reason: `Tool '${toolCall.name}' is not allowed in plan mode (read-only mode). Only read-only tools and writing to ${PLAN_FILE_PATH} are permitted.`,
        toolCall,
      };
    }

    // Step 3: Check allow rules
    const allowMatch = isInPatternList(normalizedTool, rules.allow);
    if (allowMatch) {
      // But first check if there's an ask rule that overrides
      const askMatch = isInPatternList(normalizedTool, rules.ask);
      if (askMatch) {
        return {
          decision: 'ask',
          reason: `Tool '${normalizedTool}' requires confirmation (ask rule '${askMatch}' overrides allow)`,
          matchedRule: askMatch,
          toolCall,
        };
      }

      return {
        decision: 'allow',
        reason: `Tool '${normalizedTool}' allowed by rule '${allowMatch}'`,
        matchedRule: allowMatch,
        toolCall,
      };
    }

    // Step 4: Check ask rules
    const askMatch = isInPatternList(normalizedTool, rules.ask);
    if (askMatch) {
      return {
        decision: 'ask',
        reason: `Tool '${normalizedTool}' requires confirmation by rule '${askMatch}'`,
        matchedRule: askMatch,
        toolCall,
      };
    }

    // Step 5: Apply mode-based default
    if (mode === 'auto') {
      return {
        decision: 'allow',
        reason: `Auto mode: tool '${normalizedTool}' allowed by default`,
        toolCall,
      };
    }

    // Default: ask mode requires confirmation for everything not explicitly allowed
    return {
      decision: 'ask',
      reason: `Ask mode: tool '${normalizedTool}' requires confirmation`,
      toolCall,
    };
  }

  /**
   * Check multiple tool calls
   */
  checkAll(toolCalls: ToolCallInfo[]): PermissionCheckResult[] {
    return toolCalls.map((tc) => this.check(tc));
  }

  /**
   * Add a rule dynamically
   */
  addRule(type: 'deny' | 'allow' | 'ask', pattern: string): void {
    const rules = this.config.rules;
    if (!rules[type]) {
      rules[type] = [];
    }
    if (!rules[type]!.includes(pattern)) {
      rules[type]!.push(pattern);
    }
  }

  /**
   * Remove a rule
   */
  removeRule(type: 'deny' | 'allow' | 'ask', pattern: string): boolean {
    const rules = this.config.rules;
    const list = rules[type];
    if (!list) return false;

    const index = list.indexOf(pattern);
    if (index >= 0) {
      list.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all rules
   */
  getRules(): PermissionRules {
    return {
      deny: this.config.rules.deny ? [...this.config.rules.deny] : undefined,
      allow: this.config.rules.allow ? [...this.config.rules.allow] : undefined,
      ask: this.config.rules.ask ? [...this.config.rules.ask] : undefined,
    };
  }
}

/**
 * Create a permission rule matcher
 */
export function createPermissionRuleMatcher(config: PermissionConfig): PermissionRuleMatcher {
  return new PermissionRuleMatcher(config);
}
