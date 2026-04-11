/**
 * EngineMediaService - neko-engine Media Diff Adapter
 *
 * Adapter layer between diff analyzers and neko-engine's Rust backend.
 * Uses EngineClient (HTTP dispatch via Frame Server) for all engine operations.
 *
 * Port discovery still requires vscode.commands (one-time ensureFrameServer),
 * but all subsequent operations go through HTTP to the Frame Server.
 *
 * This adapter exists to:
 *   1. Decouple analyzers from transport details (testability)
 *   2. Provide graceful degradation when engine is unavailable
 *   3. Lazy-initialize the HTTP client on first use
 */

import * as vscode from 'vscode';
import type { EngineDiffResult } from '@neko/shared';
import { EngineClient } from '@neko/neko-client';
import type { SilenceAnalysis } from '@neko/neko-client'; // Used by detectSilence()
import type { IEngineMediaService } from '../contracts/IEngineMediaService';
import { getLogger } from '../utils/logger';

const logger = getLogger('EngineMediaService');

// =============================================================================
// Service
// =============================================================================

const ENGINE_EXTENSION_ID = 'neko.neko-engine';

export class EngineMediaService implements IEngineMediaService {
  private client: EngineClient | null = null;
  private initPromise: Promise<EngineClient | null> | null = null;

  /**
   * Create with an existing EngineClient (for testing or shared instances).
   */
  constructor(client?: EngineClient) {
    this.client = client ?? null;
  }

  /**
   * Lazy-initialize: activate engine extension → start Frame Server → create HTTP client.
   * Cached after first successful init.
   */
  async ensureClient(): Promise<EngineClient | null> {
    if (this.client) return this.client;

    // Prevent concurrent initialization
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.initializeClient();
    const result = await this.initPromise;
    this.initPromise = null;
    return result;
  }

  private async initializeClient(): Promise<EngineClient | null> {
    // 1. Ensure engine extension is activated
    const ext = vscode.extensions.getExtension(ENGINE_EXTENSION_ID);
    if (!ext) {
      logger.error(`Extension ${ENGINE_EXTENSION_ID} not installed`);
      return null;
    }

    if (!ext.isActive) {
      try {
        await ext.activate();
      } catch (error) {
        logger.error(`Failed to activate ${ENGINE_EXTENSION_ID}:`, error);
        return null;
      }
    }

    // 2. Ensure Frame Server is running → get port
    try {
      const result = await vscode.commands.executeCommand<{ port: number } | null>(
        'neko.engine.ensureFrameServer',
      );
      if (!result) {
        logger.error('ensureFrameServer returned null');
        return null;
      }

      this.client = new EngineClient(result.port);
      return this.client;
    } catch (error) {
      logger.error('Failed to start frame server:', error);
      return null;
    }
  }

  /**
   * Diff two media files via the engine's native diff action.
   *
   * @param group - Action group: 'audios' | 'videos' | 'images' | 'timelines'
   * @param sourceA - Absolute path to first file (current)
   * @param sourceB - Absolute path to second file (previous)
   * @param options - Additional options passed to the engine diff action
   * @returns EngineDiffResult or null if engine unavailable
   */
  async diff(
    group: string,
    sourceA: string,
    sourceB: string,
    options?: Record<string, unknown>,
  ): Promise<EngineDiffResult | null> {
    const client = await this.ensureClient();
    if (!client) return null;

    try {
      return await client.diff<EngineDiffResult>(group, sourceA, sourceB, options);
    } catch (error) {
      logger.error(`diff(${group}) failed:`, error);
      return null;
    }
  }

  /**
   * Probe media metadata via the engine's native probe action.
   *
   * @param group - Action group: 'videos' | 'audios'
   * @param source - Absolute path to media file
   * @returns ProbeResult or null if engine unavailable
   */
  /**
   * Detect silence regions in an audio file via engine's native detect_silence action.
   */
  async detectSilence(
    source: string,
    thresholdDbfs?: number,
    minDuration?: number,
  ): Promise<SilenceAnalysis | null> {
    const client = await this.ensureClient();
    if (!client) return null;

    try {
      return await client.detectSilence(source, thresholdDbfs, minDuration);
    } catch (error) {
      logger.error('detectSilence failed:', error);
      return null;
    }
  }

  async probe(group: 'videos' | 'audios', source: string): Promise<any | null> {
    const client = await this.ensureClient();
    if (!client) return null;

    try {
      return await client.probe(group, source);
    } catch (error) {
      logger.error(`probe(${group}) failed:`, error);
      return null;
    }
  }
}
