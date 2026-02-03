/**
 * Audio utilities for Compat mode preview
 *
 * 符合 docs/principle.md 设计：
 * - 音频输出：原生ffmpeg（解封+解码）->混音->WebSocket输出->Webview播放音频
 */

export { AudioVideoSyncController, getAudioVideoSyncController, disposeAudioVideoSyncController } from './AudioVideoSyncController';
export type { SyncState, SyncConfig, SyncStats, VideoFrame, AudioChunk } from './AudioVideoSyncController';

export { WebSocketAudioReceiver, createWebSocketAudioReceiver } from './WebSocketAudioReceiver';
export type { ReceiverConfig, ReceiverState, AudioConfig, ControlCallbacks } from './WebSocketAudioReceiver';
