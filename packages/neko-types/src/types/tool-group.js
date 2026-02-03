/**
 * ToolGroup Types - Dynamic tool injection based on user intent
 *
 * ToolGroup is different from Skill:
 * - Skill: Injects system prompt + optional allowedTools restriction (runtime)
 * - ToolGroup: Controls which tools are visible to LLM (before sending)
 *
 * They work together:
 * - ToolGroup decides which tools to send to LLM (reduces tokens)
 * - Skill's allowedTools acts as secondary guard (runtime interception)
 */
export {};
//# sourceMappingURL=tool-group.js.map