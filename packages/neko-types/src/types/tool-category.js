/**
 * Tool Category Types - Tool categorization and layer management
 */
/**
 * Default category configurations
 */
export const DEFAULT_TOOL_CATEGORIES = [
    {
        id: 'system',
        displayName: 'System',
        description: 'Core system operations (shell, process)',
        icon: '⚙️',
        defaultLayer: 'core',
        priority: 100,
    },
    {
        id: 'file',
        displayName: 'File',
        description: 'File system operations (read, write, search)',
        icon: '📁',
        defaultLayer: 'core',
        priority: 90,
    },
    {
        id: 'project',
        displayName: 'Project',
        description: 'Project management operations',
        icon: '📦',
        defaultLayer: 'skill',
        priority: 85,
    },
    {
        id: 'timeline',
        displayName: 'Timeline',
        description: 'Video timeline operations',
        icon: '🎬',
        defaultLayer: 'skill',
        priority: 80,
    },
    {
        id: 'media',
        displayName: 'Media',
        description: 'Media processing operations',
        icon: '🎥',
        defaultLayer: 'skill',
        priority: 70,
    },
    {
        id: 'document',
        displayName: 'Document',
        description: 'Document processing operations',
        icon: '📄',
        defaultLayer: 'skill',
        priority: 65,
    },
    {
        id: 'generation',
        displayName: 'Generation',
        description: 'AI content generation',
        icon: '🤖',
        defaultLayer: 'ondemand',
        priority: 60,
    },
    {
        id: 'analysis',
        displayName: 'Analysis',
        description: 'Content analysis operations',
        icon: '📊',
        defaultLayer: 'ondemand',
        priority: 50,
    },
    {
        id: 'mcp',
        displayName: 'MCP',
        description: 'MCP server tools',
        icon: '🔌',
        defaultLayer: 'ondemand',
        priority: 40,
    },
    {
        id: 'workflow',
        displayName: 'Workflow',
        description: 'Workflow engine tools',
        icon: '⚡',
        defaultLayer: 'ondemand',
        priority: 30,
    },
];
/**
 * Core tools that are always injected (L1 layer)
 * - Basic file operations: Read, Write, ListDirectory, Grep
 * - Shell execution: Bash
 * - Tool discovery & skill management: SearchTools, ActivateSkill, DeactivateSkill, GetContext
 */
export const CORE_TOOLS = [
    'Read',
    'Write',
    'Bash',
    'ListDirectory',
    'Grep',
    'SearchTools',
    'ActivateSkill',
    'DeactivateSkill',
    'GetContext',
];
//# sourceMappingURL=tool-category.js.map