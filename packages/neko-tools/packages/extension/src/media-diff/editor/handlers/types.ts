/**
 * Handler Context — shared state passed to domain-specific handlers.
 *
 * All mutable state lives in MediaDiffMessageHandler; handlers receive
 * a reference to this context so they can read/write shared fields
 * without owning them.
 */

import type * as vscode from 'vscode';
import type { EngineClient } from '@neko/neko-client';
import type { DiffResult, MediaDiffResponse } from '@neko/shared';
import type { MediaDiffService } from '../../services/MediaDiffService';

export interface IHandlerContext {
  // ── Immutable references ────────────────────────────────────────────
  readonly webview: vscode.Webview;
  readonly fileUri: vscode.Uri;
  readonly previousUri?: vscode.Uri;
  readonly diffService: MediaDiffService;
  readonly engineClient: EngineClient | null;
  /** Session ID for grouping streams from this handler */
  readonly sessionId: string;

  // ── Mutable state ───────────────────────────────────────────────────
  isDisposed: boolean;
  /** Cached previous file path for frame extraction (Git mode writes to temp file) */
  previousFilePath: string | null;
  /** Per-handler AbortController — only cancels this handler's analysis */
  currentAbortController: AbortController | null;
  /**
   * In-flight promise for ensurePreviousFilePath (Git mode only).
   * Set before git show starts, cleared after it resolves.
   * handleStartStreaming awaits this before using previousFilePath.
   */
  fetchPromise: Promise<void> | null;
  /** Cached diff result — used to avoid redundant probe calls in handleStartStreaming */
  lastDiffResult: DiffResult | null;
  /** Last ref used for diff (for re-analysis with time range) */
  lastRef: string;
  /** User-specified time range for analysis (video/audio only) */
  timeRange: { startTime?: number; endTime?: number };

  // ── Streaming state ─────────────────────────────────────────────────
  /** Current version video stream ID */
  currentStreamId: string | null;
  /** Previous version video stream ID */
  previousStreamId: string | null;
  /** Current version audio stream ID (video mode, may be null if no audio track) */
  currentAudioStreamId: string | null;
  /** Previous version audio stream ID (video mode) */
  previousAudioStreamId: string | null;
  /** Current version audio-only stream ID (audio diff mode) */
  currentAudioOnlyStreamId: string | null;
  /** Previous version audio-only stream ID (audio diff mode) */
  previousAudioOnlyStreamId: string | null;

  // ── Frame operations state ──────────────────────────────────────────
  /** Debounce timer for seek requests to avoid VideoToolbox session exhaustion */
  seekDebounceTimer: ReturnType<typeof setTimeout> | null;
  /** Pending frame extraction promises for concurrency control */
  activeFrameExtractions: number;

  // ── Helpers ─────────────────────────────────────────────────────────
  /** Send message to webview (no-op if disposed) */
  sendMessage(message: Partial<MediaDiffResponse>): void;
  /** Assert engine client is available. Throws into caller's try/catch. */
  requireEngine(): EngineClient;
}

/** Maximum concurrent frame extractions (shared constant) */
export const MAX_CONCURRENT_FRAMES = 4;
