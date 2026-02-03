/**
 * WebSocketAudioReceiver - WebSocket 音频接收器
 *
 * 职责：
 * - 连接音频 WebSocket 服务器
 * - 解析二进制音频消息
 * - 将音频数据传递给 AudioVideoSyncController
 *
 * 消息协议：
 * - DATA (0x01): [type(1)] [timestamp(8)] [pcm_data(n*4)]
 * - CONFIG (0x02): [type(1)] [sampleRate(4)] [channels(4)]
 * - CONTROL (0x03): [type(1)] [command(1)] [seekTime(8)?]
 */

import type { AudioChunk } from './AudioVideoSyncController';

// =============================================================================
// Types
// =============================================================================

/**
 * 音频消息类型
 */
enum AudioMessageType {
	DATA = 0x01,
	CONFIG = 0x02,
	CONTROL = 0x03,
}

/**
 * 播放控制命令
 */
enum AudioControlCommand {
	PLAY = 0x01,
	PAUSE = 0x02,
	STOP = 0x03,
	SEEK = 0x04,
}

/**
 * 音频配置
 */
export interface AudioConfig {
	sampleRate: number;
	channels: number;
}

/**
 * 接收器配置
 */
export interface ReceiverConfig {
	/** WebSocket URL */
	url: string;
	/** 自动重连 */
	autoReconnect?: boolean;
	/** 重连间隔（毫秒） */
	reconnectInterval?: number;
	/** 最大重连次数 */
	maxReconnectAttempts?: number;
}

/**
 * 接收器状态
 */
export type ReceiverState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * 控制命令回调
 */
export interface ControlCallbacks {
	onPlay?: () => void;
	onPause?: () => void;
	onStop?: () => void;
	onSeek?: (time: number) => void;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_RECONNECT_INTERVAL = 1000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;

// =============================================================================
// Receiver Implementation
// =============================================================================

/**
 * WebSocket 音频接收器
 */
export class WebSocketAudioReceiver {
	private _config: Required<ReceiverConfig>;
	private _ws: WebSocket | null = null;
	private _state: ReceiverState = 'disconnected';
	private _reconnectAttempts = 0;
	private _reconnectTimer: number | null = null;
	private _isDisposed = false;

	// Audio config from server
	private _audioConfig: AudioConfig = {
		sampleRate: 48000,
		channels: 2,
	};

	// Callbacks
	private _onAudioChunk: ((chunk: AudioChunk) => void) | null = null;
	private _onConfigReceived: ((config: AudioConfig) => void) | null = null;
	private _onStateChange: ((state: ReceiverState) => void) | null = null;
	private _controlCallbacks: ControlCallbacks = {};

	// Statistics
	private _stats = {
		chunksReceived: 0,
		bytesReceived: 0,
		lastChunkTime: 0,
	};

	constructor(config: ReceiverConfig) {
		this._config = {
			url: config.url,
			autoReconnect: config.autoReconnect ?? true,
			reconnectInterval: config.reconnectInterval ?? DEFAULT_RECONNECT_INTERVAL,
			maxReconnectAttempts: config.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
		};
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/**
	 * 获取当前状态
	 */
	get state(): ReceiverState {
		return this._state;
	}

	/**
	 * 获取音频配置
	 */
	get audioConfig(): AudioConfig {
		return { ...this._audioConfig };
	}

	/**
	 * 设置音频块回调
	 */
	setAudioChunkCallback(callback: ((chunk: AudioChunk) => void) | null): void {
		this._onAudioChunk = callback;
	}

	/**
	 * 设置配置接收回调
	 */
	setConfigCallback(callback: ((config: AudioConfig) => void) | null): void {
		this._onConfigReceived = callback;
	}

	/**
	 * 设置状态变化回调
	 */
	setStateChangeCallback(callback: ((state: ReceiverState) => void) | null): void {
		this._onStateChange = callback;
	}

	/**
	 * 设置控制命令回调
	 */
	setControlCallbacks(callbacks: ControlCallbacks): void {
		this._controlCallbacks = callbacks;
	}

	/**
	 * 连接到服务器
	 */
	connect(): void {
		if (this._isDisposed || this._state === 'connecting' || this._state === 'connected') {
			return;
		}

		this._setState('connecting');
		this._reconnectAttempts = 0;

		try {
			this._ws = new WebSocket(this._config.url);
			this._ws.binaryType = 'arraybuffer';

			this._ws.onopen = () => {
				console.log('[WebSocketAudioReceiver] Connected');
				this._setState('connected');
				this._reconnectAttempts = 0;
			};

			this._ws.onmessage = (event) => {
				this._handleMessage(event.data);
			};

			this._ws.onclose = () => {
				console.log('[WebSocketAudioReceiver] Disconnected');
				this._ws = null;
				this._setState('disconnected');
				this._tryReconnect();
			};

			this._ws.onerror = (error) => {
				console.error('[WebSocketAudioReceiver] Error:', error);
				this._setState('error');
			};
		} catch (error) {
			console.error('[WebSocketAudioReceiver] Failed to connect:', error);
			this._setState('error');
			this._tryReconnect();
		}
	}

	/**
	 * 断开连接
	 */
	disconnect(): void {
		this._cancelReconnect();

		if (this._ws) {
			this._ws.close();
			this._ws = null;
		}

		this._setState('disconnected');
	}

	/**
	 * 获取统计信息
	 */
	getStats(): typeof this._stats {
		return { ...this._stats };
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		if (this._isDisposed) return;

		this._isDisposed = true;
		this.disconnect();
		this._onAudioChunk = null;
		this._onConfigReceived = null;
		this._onStateChange = null;
		this._controlCallbacks = {};
	}

	// ---------------------------------------------------------------------------
	// Private Methods
	// ---------------------------------------------------------------------------

	/**
	 * 设置状态
	 */
	private _setState(state: ReceiverState): void {
		if (this._state === state) return;

		this._state = state;
		this._onStateChange?.(state);
	}

	/**
	 * 处理接收到的消息
	 */
	private _handleMessage(data: ArrayBuffer): void {
		if (data.byteLength < 1) return;

		const view = new DataView(data);
		const messageType = view.getUint8(0);

		switch (messageType) {
			case AudioMessageType.DATA:
				this._handleDataMessage(data);
				break;
			case AudioMessageType.CONFIG:
				this._handleConfigMessage(data);
				break;
			case AudioMessageType.CONTROL:
				this._handleControlMessage(data);
				break;
			default:
				console.warn(`[WebSocketAudioReceiver] Unknown message type: ${messageType}`);
		}
	}

	/**
	 * 处理音频数据消息
	 */
	private _handleDataMessage(data: ArrayBuffer): void {
		// Format: [type(1)] [timestamp(8)] [pcm_data(n*4)]
		if (data.byteLength < 9) return;

		const view = new DataView(data);
		const timestamp = view.getFloat64(1, true); // Little-endian

		// Extract PCM data
		const pcmByteLength = data.byteLength - 9;
		const pcmData = new Float32Array(data, 9, pcmByteLength / 4);

		// Update stats
		this._stats.chunksReceived++;
		this._stats.bytesReceived += data.byteLength;
		this._stats.lastChunkTime = timestamp;

		// Create audio chunk
		const chunk: AudioChunk = {
			data: new Float32Array(pcmData), // Copy to avoid buffer reuse issues
			timestamp,
			receivedAt: performance.now(),
		};

		// Notify callback
		this._onAudioChunk?.(chunk);
	}

	/**
	 * 处理配置消息
	 */
	private _handleConfigMessage(data: ArrayBuffer): void {
		// Format: [type(1)] [sampleRate(4)] [channels(4)]
		if (data.byteLength < 9) return;

		const view = new DataView(data);
		const sampleRate = view.getUint32(1, true);
		const channels = view.getUint32(5, true);

		this._audioConfig = { sampleRate, channels };

		console.log(
			`[WebSocketAudioReceiver] Config received: sampleRate=${sampleRate}, channels=${channels}`
		);

		this._onConfigReceived?.(this._audioConfig);
	}

	/**
	 * 处理控制消息
	 */
	private _handleControlMessage(data: ArrayBuffer): void {
		// Format: [type(1)] [command(1)] [seekTime(8)?]
		if (data.byteLength < 2) return;

		const view = new DataView(data);
		const command = view.getUint8(1);

		switch (command) {
			case AudioControlCommand.PLAY:
				this._controlCallbacks.onPlay?.();
				break;
			case AudioControlCommand.PAUSE:
				this._controlCallbacks.onPause?.();
				break;
			case AudioControlCommand.STOP:
				this._controlCallbacks.onStop?.();
				break;
			case AudioControlCommand.SEEK:
				if (data.byteLength >= 10) {
					const seekTime = view.getFloat64(2, true);
					this._controlCallbacks.onSeek?.(seekTime);
				}
				break;
		}
	}

	/**
	 * 尝试重连
	 */
	private _tryReconnect(): void {
		if (
			this._isDisposed ||
			!this._config.autoReconnect ||
			this._reconnectAttempts >= this._config.maxReconnectAttempts
		) {
			return;
		}

		this._reconnectAttempts++;
		console.log(
			`[WebSocketAudioReceiver] Reconnecting (${this._reconnectAttempts}/${this._config.maxReconnectAttempts})...`
		);

		this._reconnectTimer = window.setTimeout(() => {
			this.connect();
		}, this._config.reconnectInterval);
	}

	/**
	 * 取消重连
	 */
	private _cancelReconnect(): void {
		if (this._reconnectTimer !== null) {
			clearTimeout(this._reconnectTimer);
			this._reconnectTimer = null;
		}
	}
}

// =============================================================================
// Factory
// =============================================================================

export function createWebSocketAudioReceiver(config: ReceiverConfig): WebSocketAudioReceiver {
	return new WebSocketAudioReceiver(config);
}
