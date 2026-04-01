/**
 * Coordinator Module — Multi-phase SubAgent orchestration
 *
 * Provides:
 * - Coordinator: Phase-based workflow (plan → confirm → execute → verify → done)
 * - TaskPool: Dependency-aware task queue with priority
 * - PermissionBridge: Route SubAgent confirmations to parent UI
 * - CoordinateTool: LLM-callable tool for launching coordinator workflows
 */

// =============================================================================
// Types
// =============================================================================

export type {
  CoordinatorPhase,
  CoordinatorConfig,
  CoordinatorDeps,
  CoordinatorEvent,
  CoordinatorEventType,
  CoordinateToolDeps,
  ICoordinator,
  PhaseResult,
  TaskItem,
  TaskStatus,
  TaskNotification,
  TaskPoolProgress,
} from './types';

// =============================================================================
// Core
// =============================================================================

export { Coordinator, createCoordinator } from './coordinator';
export { TaskPool, createTaskPool } from './task-pool';
export { PermissionBridge, createPermissionBridge } from './permission-bridge';
export type { PermissionBridgeConfig } from './permission-bridge';

// =============================================================================
// Tool
// =============================================================================

export { createCoordinateTool } from './coordinate-tool';
