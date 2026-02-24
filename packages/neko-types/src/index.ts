export * from './types/index';

// Shared utilities (animation, easing, interpolation)
export * from './utils/index';

// Configuration (unified config format for agent-cli and platform)
export * from './config/index';

// Error handling
export * from './errors/base-error';

// Tools
export * from './tools/index';

// Core utilities
export * from './core/index';

// Operations (EditOperation 指令序列系统)
export * from './operations';

// VSCode Webview API is NOT exported from main entry to avoid
// requiring DOM types in Node.js consumers.
// Use subpath import instead: import { ... } from '@neko/shared/vscode';
