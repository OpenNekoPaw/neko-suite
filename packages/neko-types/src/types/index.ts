// =============================================================================
// Types Index - Re-export all types from submodules
// =============================================================================

// Generated engine types (from packages/neko-proto/*.proto)
export * from '../generated/timeline.engine';
export * from '../generated/diff.engine';

// Track types
export * from './track';

// Easing types
export * from './easing';

// Animation system
export * from './animation';

// Blend modes
export * from './blendMode';

// Transform
export * from './transform';

// Color correction
export * from './colorCorrection';

// Geometry primitives
export * from './geometry';

// Masks
export * from './mask';

// Transitions
export * from './transition';

// Effects
export * from './effects';

// Keyframes
export * from './keyframe';

// Audio
export * from './audio';

// Speed
export * from './speed';

// Shapes
export * from './shape';

// Timeline elements
export * from './element';

// Subtitle
export * from './subtitle';

// Timeline tracks
export * from './timelineTrack';

// UI state (separated from engine model)
export * from './ui-state';

// Project
export * from './project';

// Messages
export * from './message';

// Configuration
export * from './config';

// AI Actions
export * from './aiAction';

// Task core types (TaskManager interfaces)
export * from './task';

// Task Views (Extension ↔ Webview DTO)
export * from './task-view';

// SubAgent UI Types
export * from './subagent';

// =============================================================================
// Platform/Agent Shared Types (for package split)
// =============================================================================

// Tool types
export * from './tool';

// MCP types
export * from './mcp';

// Platform interface types
export * from './platform';

// Agent interface types
export * from './agent';

// Memory types (for agent context management)
export * from './memory';

// Skill types (Claude-compatible skills and slash commands)
export * from './skill';

// ToolGroup types (dynamic tool injection)
export * from './tool-group';

// Tool category types (tool categorization and layer management)
export * from './tool-category';

// Tool injection types (three-layer injection mechanism)
export * from './tool-injection';

// Hook types (file-based hooks for agent automation)
export * from './hook';

// Media protocol types (Extension ↔ Webview media processing IPC)
export * from './mediaProtocol';

// Export protocol types (Extension ↔ Webview export IPC)
export * from './exportProtocol';

// Media diff protocol types (Extension ↔ Webview media diff IPC)
export * from './mediaDiffProtocol';

// Asset management types
export * from './asset';

// Context manager types (token budget and lifecycle management)
export * from './context-manager';

// Conversation compressor types (sliding window and summarization)
export * from './conversation-compressor';

// Skill conflict resolution types
export * from './skill-conflict';

// Context persistence types (cross-session state)
export * from './context-persistence';

// Prompt types (prompt template management)
export * from './prompt';

// Agent message types (unified message types for Extension ↔ Webview ↔ CLI)
export * from './agent-message';

// Media engine types (progressive media processing architecture)
export * from './mediaEngine';

// Canvas types (infinite canvas editor)
export * from './canvas';

// Extension API types (inter-extension communication)
export * from './extension-api';
