/**
 * Media Processing Protocol - Media Engine Types
 *
 * Progressive media engine architecture types.
 */

import type { MediaInfo } from './base';

// =============================================================================
// Media Engine Protocol (Progressive Architecture)
// =============================================================================

/**
 * 媒体请求基础类型
 */
interface BaseMediaRequest {
  /** 请求 ID，用于匹配响应 */
  requestId: string;
  /** 请求时间戳 */
  timestamp: number;
}

/**
 * 媒体响应基础类型
 */
interface BaseMediaResponse {
  /** 对应的请求 ID */
  requestId: string;
  /** 响应类型 */
  type: string;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * Media engine mode
 */
export type MediaEngineModeType = 'basic' | 'compatible' | 'auto';

/**
 * Download state for compatible mode
 */
export type DownloadStateType =
  | 'idle'
  | 'downloading'
  | 'extracting'
  | 'verifying'
  | 'completed'
  | 'error';

/**
 * Get current media engine mode request
 */
export interface GetMediaEngineModeRequest extends BaseMediaRequest {
  type: 'mediaEngine:getMode';
}

/**
 * Get current media engine mode response
 */
export interface GetMediaEngineModeResponse extends BaseMediaResponse {
  type: 'mediaEngine:response:getMode';
  payload?: {
    /** Current active mode */
    currentMode: MediaEngineModeType | null;
    /** Whether compatible mode is installed */
    compatibleModeInstalled: boolean;
    /** Recommended mode for current context */
    recommendedMode?: MediaEngineModeType;
  };
}

/**
 * Set media engine mode request
 */
export interface SetMediaEngineModeRequest extends BaseMediaRequest {
  type: 'mediaEngine:setMode';
  payload: {
    /** Mode to set */
    mode: MediaEngineModeType;
  };
}

/**
 * Set media engine mode response
 */
export interface SetMediaEngineModeResponse extends BaseMediaResponse {
  type: 'mediaEngine:response:setMode';
  payload?: {
    /** Whether mode was set successfully */
    success: boolean;
    /** New active mode */
    activeMode: MediaEngineModeType;
  };
}

/**
 * Get download status request
 */
export interface GetDownloadStatusRequest extends BaseMediaRequest {
  type: 'mediaEngine:getDownloadStatus';
}

/**
 * Get download status response
 */
export interface GetDownloadStatusResponse extends BaseMediaResponse {
  type: 'mediaEngine:response:getDownloadStatus';
  payload?: {
    /** Whether compatible mode is installed */
    installed: boolean;
    /** Installed version */
    version?: string;
    /** Installed size in bytes */
    size?: number;
    /** Current download state */
    state: DownloadStateType;
    /** Download progress (0-100) */
    progress?: number;
    /** Error message if state is error */
    error?: string;
  };
}

/**
 * Start download request
 */
export interface StartDownloadRequest extends BaseMediaRequest {
  type: 'mediaEngine:startDownload';
}

/**
 * Start download response
 */
export interface StartDownloadResponse extends BaseMediaResponse {
  type: 'mediaEngine:response:startDownload';
  payload?: {
    /** Whether download started successfully */
    started: boolean;
  };
}

/**
 * Download progress notification (Extension → Webview push)
 */
export interface DownloadProgressNotification {
  type: 'mediaEngine:downloadProgress';
  payload: {
    /** Download progress (0-100) */
    progress: number;
    /** Current state */
    state: DownloadStateType;
    /** Downloaded bytes */
    downloadedBytes?: number;
    /** Total bytes */
    totalBytes?: number;
  };
}

/**
 * Download complete notification (Extension → Webview push)
 */
export interface DownloadCompleteNotification {
  type: 'mediaEngine:downloadComplete';
  payload: {
    /** Whether download succeeded */
    success: boolean;
    /** Error message if failed */
    error?: string;
    /** Installed version */
    version?: string;
  };
}

/**
 * Analyze media for mode recommendation request
 */
export interface AnalyzeMediaRequest extends BaseMediaRequest {
  type: 'mediaEngine:analyzeMedia';
  payload: {
    /** Media file path */
    videoPath: string;
  };
}

/**
 * Analyze media response
 */
export interface AnalyzeMediaResponse extends BaseMediaResponse {
  type: 'mediaEngine:response:analyzeMedia';
  payload?: {
    /** Media information */
    mediaInfo: MediaInfo;
    /** Recommended mode */
    recommendedMode: MediaEngineModeType;
    /** Reason for recommendation */
    reason: string;
    /** Whether download is required */
    requiresDownload: boolean;
    /** Download size if required */
    downloadSize?: number;
    /** Unsupported features in basic mode */
    unsupportedFeatures?: string[];
  };
}

/**
 * All media engine request types
 */
export type MediaEngineRequest =
  | GetMediaEngineModeRequest
  | SetMediaEngineModeRequest
  | GetDownloadStatusRequest
  | StartDownloadRequest
  | AnalyzeMediaRequest;

/**
 * All media engine response types
 */
export type MediaEngineResponse =
  | GetMediaEngineModeResponse
  | SetMediaEngineModeResponse
  | GetDownloadStatusResponse
  | StartDownloadResponse
  | AnalyzeMediaResponse;

/**
 * All media engine notification types (push from Extension)
 */
export type MediaEngineNotification = DownloadProgressNotification | DownloadCompleteNotification;
