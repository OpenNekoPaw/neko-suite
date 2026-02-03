/**
 * AudioServerService - WebSocket 音频流服务
 *
 * 职责：
 * - 提供 WebSocket 服务器用于音频流传输
 * - 将 PCM 音频数据推送到 Webview
 * - 支持多客户端连接
 *
 * 架构（符合 docs/principle.md）：
 * ```
 * StreamingAudioDecoderService (PCM) → AudioServerService (WebSocket) → Webview (Web Audio API)
 * ```
 */

import * as http from 'http';
import * as WebSocket from 'ws';
import * as vscode from 'vscode';

// =============================================================================
// Types
// =============================================================================

interface AudioServerConfig {
	/** 服务器端口（0 表示自动分配） */
	port?: number;
	/** 采样率 */
	sampleRate?: number;
	/** 声道数 */
	channels?: number;
}

interface AudioServerStats {
	/** 已发送的音频块数 */
	chunksSent: number;
	/** 连接的客户端数 */
	connectedClients: number;
	/** 是否运行中 */
	isRunning: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_PORT = 0; // Auto-assign
const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_CHANNELS = 2;

// =============================================================================
// Audio Message Protocol
// =============================================================================

/**
 * 音频消息类型
 */
enum AudioMessageType {
	/** 音频数据 */
	DATA = 0x01,
	/** 配置信息 */
	CONFIG = 0x02,
	/** 播放控制 */
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

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * 音频服务器服务
 */
export class AudioServerService implements vscode.Disposable {
	private _config: Required<AudioServerConfig>;
	private _server: http.Server | null = null;
	private _wss: WebSocket.Server | null = null;
	private _clients: Set<WebSocket> = new Set();
	private _port: number = 0;
	private _isDisposed = false;
	private _stats: AudioServerStats = {
		chunksSent: 0,
		connectedClients: 0,
		isRunning: false,
	};

	/**
	 * 尝试创建 AudioServerService 实例
	 */
	static async tryCreate(config?: AudioServerConfig): Promise<AudioServerService | null> {
		const service = new AudioServerService(config);
		const initialized = await service.initialize();

		if (initialized) {
			return service;
		}

		service.dispose();
		return null;
	}

	private constructor(config?: AudioServerConfig) {
		this._config = {
			port: config?.port ?? DEFAULT_PORT,
			sampleRate: config?.sampleRate ?? DEFAULT_SAMPLE_RATE,
			channels: config?.channels ?? DEFAULT_CHANNELS,
		};
	}

	/**
	 * 初始化服务器
	 */
	private async initialize(): Promise<boolean> {
		return new Promise((resolve) => {
			try {
				// Create HTTP server
				this._server = http.createServer();

				// Create WebSocket server
				this._wss = new WebSocket.Server({ server: this._server });

				// Handle connections
				this._wss.on('connection', (ws) => {
					this._handleConnection(ws);
				});

				// Start listening
				this._server.listen(this._config.port, '127.0.0.1', () => {
					const address = this._server?.address();
					if (address && typeof address === 'object') {
						this._port = address.port;
						this._stats.isRunning = true;
						console.log(`[AudioServerService] Started on port ${this._port}`);
						resolve(true);
					} else {
						resolve(false);
					}
				});

				this._server.on('error', (error) => {
					console.error('[AudioServerService] Server error:', error);
					resolve(false);
				});
			} catch (error) {
				console.error('[AudioServerService] Failed to initialize:', error);
				resolve(false);
			}
		});
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/**
	 * 检查服务是否可用
	 */
	isAvailable(): boolean {
		return this._stats.isRunning && !this._isDisposed;
	}

	/**
	 * 获取服务器端口
	 */
	getPort(): number {
		return this._port;
	}

	/**
	 * 获取 WebSocket URL
	 */
	getWebsocketUrl(): string {
		return `ws://127.0.0.1:${this._port}`;
	}

	/**
	 * 推送音频数据到所有连接的客户端
	 * @param pcmData PCM 音频数据（Float32Array）
	 * @param timestamp 时间戳（秒）
	 */
	pushAudioData(pcmData: Float32Array, timestamp: number): void {
		if (!this.isAvailable() || this._clients.size === 0) {
			return;
		}

		// Build binary message
		// Format: [type(1)] [timestamp(8)] [data(n*4)]
		const buffer = Buffer.alloc(1 + 8 + pcmData.length * 4);
		let offset = 0;

		// Message type
		buffer.writeUInt8(AudioMessageType.DATA, offset);
		offset += 1;

		// Timestamp (double)
		buffer.writeDoubleLE(timestamp, offset);
		offset += 8;

		// PCM data (float32)
		for (let i = 0; i < pcmData.length; i++) {
			buffer.writeFloatLE(pcmData[i]!, offset);
			offset += 4;
		}

		// Send to all clients
		for (const client of this._clients) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(buffer);
			}
		}

		this._stats.chunksSent++;
	}

	/**
	 * 发送配置信息到所有客户端
	 */
	sendConfig(): void {
		if (!this.isAvailable()) {
			return;
		}

		// Build config message
		// Format: [type(1)] [sampleRate(4)] [channels(4)]
		const buffer = Buffer.alloc(1 + 4 + 4);
		let offset = 0;

		buffer.writeUInt8(AudioMessageType.CONFIG, offset);
		offset += 1;

		buffer.writeUInt32LE(this._config.sampleRate, offset);
		offset += 4;

		buffer.writeUInt32LE(this._config.channels, offset);

		// Send to all clients
		for (const client of this._clients) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(buffer);
			}
		}
	}

	/**
	 * 发送播放控制命令
	 */
	sendControl(command: 'play' | 'pause' | 'stop' | 'seek', seekTime?: number): void {
		if (!this.isAvailable()) {
			return;
		}

		const commandMap: Record<string, AudioControlCommand> = {
			play: AudioControlCommand.PLAY,
			pause: AudioControlCommand.PAUSE,
			stop: AudioControlCommand.STOP,
			seek: AudioControlCommand.SEEK,
		};

		// Build control message
		// Format: [type(1)] [command(1)] [seekTime(8)?]
		const hasSeekTime = command === 'seek' && seekTime !== undefined;
		const buffer = Buffer.alloc(1 + 1 + (hasSeekTime ? 8 : 0));
		let offset = 0;

		buffer.writeUInt8(AudioMessageType.CONTROL, offset);
		offset += 1;

		buffer.writeUInt8(commandMap[command]!, offset);
		offset += 1;

		if (hasSeekTime) {
			buffer.writeDoubleLE(seekTime!, offset);
		}

		// Send to all clients
		for (const client of this._clients) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(buffer);
			}
		}
	}

	/**
	 * 获取统计信息
	 */
	getStats(): AudioServerStats {
		return { ...this._stats };
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		if (this._isDisposed) {
			return;
		}

		this._isDisposed = true;
		this._stats.isRunning = false;

		// Close all client connections
		for (const client of this._clients) {
			client.close();
		}
		this._clients.clear();

		// Close WebSocket server
		if (this._wss) {
			this._wss.close();
			this._wss = null;
		}

		// Close HTTP server
		if (this._server) {
			this._server.close();
			this._server = null;
		}

		console.log('[AudioServerService] Disposed');
	}

	// ---------------------------------------------------------------------------
	// Private Methods
	// ---------------------------------------------------------------------------

	/**
	 * 处理新的 WebSocket 连接
	 */
	private _handleConnection(ws: WebSocket): void {
		console.log('[AudioServerService] Client connected');

		this._clients.add(ws);
		this._stats.connectedClients = this._clients.size;

		// Send config on connect
		this.sendConfig();

		// Handle messages from client
		ws.on('message', (data) => {
			this._handleClientMessage(ws, data);
		});

		// Handle disconnect
		ws.on('close', () => {
			console.log('[AudioServerService] Client disconnected');
			this._clients.delete(ws);
			this._stats.connectedClients = this._clients.size;
		});

		// Handle errors
		ws.on('error', (error) => {
			console.error('[AudioServerService] Client error:', error);
			this._clients.delete(ws);
			this._stats.connectedClients = this._clients.size;
		});
	}

	/**
	 * 处理客户端消息
	 */
	private _handleClientMessage(_ws: WebSocket, _data: WebSocket.Data): void {
		// Currently no client-to-server messages are handled
		// Future: could handle seek requests, volume changes, etc.
	}
}

// =============================================================================
// Factory
// =============================================================================

let _instance: AudioServerService | null = null;

export async function getAudioServerService(config?: AudioServerConfig): Promise<AudioServerService | null> {
	if (!_instance || !_instance.isAvailable()) {
		_instance = await AudioServerService.tryCreate(config);
	}
	return _instance;
}

export function disposeAudioServerService(): void {
	if (_instance) {
		_instance.dispose();
		_instance = null;
	}
}
