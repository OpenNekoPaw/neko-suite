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

// Project memory types (cross-session agent memory)
export * from './project-memory';

// Prompt types (prompt template management)
export * from './prompt';

// Agent message types (unified message types for Extension ↔ Webview ↔ CLI)
export * from './agent-message';

// Media engine types (progressive media processing architecture)
export * from './mediaEngine';

// Canvas types (infinite canvas editor)
export * from './canvas';
export * from './canvas-drop';
export * from './canvas-timeline-sync';
export * from './storyboard-planner';

// Sketch types (.nks document format)
export * from './sketch';

// Puppet types (.nkp project format)
export * from './puppet';
export * from './puppet-motion-preset';

// Puppet face parameter template (standard 32-param face model)
export * from './puppet-face-params';

// Keyframe editor types (shared mini-timeline for puppet/model editors)
export * from './keyframe-editor';

// 3D Model project types (.nkm project format)
export * from './model-project';

// Audio project types (.nka file format)
export * from './audioProject';

// Proxy protocol types (video proxy generation and management)
export * from './proxyProtocol';

// Extension API types (inter-extension communication)
export * from './extension-api';

// Auth types (shared interfaces for neko-auth ecosystem)
export * from './auth';

// Generation types (output params + model config)
export * from './generation';

// Agent context types (unified sendToAgent payload)
export * from './agent-context';

// Loading tier types (tiered lazy loading for tools, skills, commands)
export * from './loading-tier';

// Generated asset types (cross-plugin asset reference schema, ADR-4)
export * from './generated-asset';

// Character registry types (git-tracked project identity source)
export * from './character-registry';

// Storage layout types (unified path management, three-level hierarchy)
export * from './storage';

// Tool name constants (single source of truth for all registered tool names)
export * from './tool-names';

// Agent capability provider protocol (sub-package → neko-agent capability injection)
export * from './agent-capability';

// Prompt fragment (PR3e: sub-package prompt contribution)
export * from './prompt-fragment';

// Provider card expression context contracts
export * from './provider-card';

// Creative entity graph types (cross-modal relationship graph, ADR Phase 3)
export * from './creative-entity-graph';
