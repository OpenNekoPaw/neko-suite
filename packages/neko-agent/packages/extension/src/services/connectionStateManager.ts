/**
 * Connection State Manager
 *
 * Manages connection status for MCP servers.
 * Provides a unified interface for tracking, querying, and broadcasting connection states.
 */

import * as vscode from 'vscode';
import {
  createRuntimeConnectionStateStore,
  type ConnectionServiceType,
  type ConnectionState,
  type ConnectionStateChangeEvent,
  type ConnectionStateListener,
  type ConnectionStatus,
  type RuntimeConnectionStateStore,
} from '@neko/agent/runtime';
import { getLogger } from '../base';

const logger = getLogger('ConnectionStateManager');

export type {
  ConnectionServiceType,
  ConnectionState,
  ConnectionStateChangeEvent,
  ConnectionStateListener,
  ConnectionStatus,
};

/**
 * Connection State Manager
 *
 * Singleton service that manages connection states for MCP services.
 */
export class ConnectionStateManager implements vscode.Disposable {
  private readonly store: RuntimeConnectionStateStore = createRuntimeConnectionStateStore({
    onListenerError: (error) => logger.error('Listener error:', error),
  });

  /**
   * Update connection state for a service
   */
  updateState(
    id: string,
    name: string,
    type: ConnectionServiceType,
    status: ConnectionStatus,
    error?: string,
  ): void {
    this.store.updateState({
      id,
      name,
      type,
      status,
      ...(error !== undefined ? { error } : {}),
    });
  }

  /**
   * Get connection state for a service
   */
  getState(id: string, type: ConnectionServiceType): ConnectionState | undefined {
    return this.store.getState(id, type);
  }

  /**
   * Get all MCP connection states
   */
  getMCPStates(): ConnectionState[] {
    return this.store.getStatesByType('mcp');
  }

  /**
   * Get all connection states
   */
  getAllStates(): ConnectionState[] {
    return this.store.getAllStates();
  }

  /**
   * Get states as a map for UI consumption
   */
  getStatesMap(): Record<string, { status: ConnectionStatus; error?: string }> {
    return this.store.getStatesMap();
  }

  /**
   * Add a state change listener
   */
  addListener(listener: ConnectionStateListener): vscode.Disposable {
    const dispose = this.store.addListener(listener);
    return { dispose };
  }

  /**
   * Remove state for a service
   */
  removeState(id: string, type: ConnectionServiceType): void {
    this.store.removeState(id, type);
  }

  /**
   * Clear all states
   */
  clear(): void {
    this.store.clear();
  }

  dispose(): void {
    this.store.dispose();
  }
}

// Service identifier for DI
import { createServiceId } from '../base';
export const IConnectionStateManager =
  createServiceId<ConnectionStateManager>('connectionStateManager');
