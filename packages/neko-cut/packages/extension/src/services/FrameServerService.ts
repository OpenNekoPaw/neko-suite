/**
 * FrameServerService - Localhost HTTP/WebSocket 帧流服务
 *
 * 职责：
 * - 管理 Rust native addon 中的 FrameServerSession
 * - 提供高性能帧流传输，绕过 VSCode postMessage 开销
 * - 支持 MJPEG 和 WebSocket 两种流模式
 *
 * 设计原则：
 * - 单一职责：仅负责帧服务器生命周期管理
 * - 依赖倒置：通过接口与 Rust addon 交互
 */

import * as vscode from 'vscode';

// Types from the native addon
interface FrameServerConfig {
	port?: number;
	maxBufferSize?: number;
	jpegQuality?: number;
}

interface FrameServerStats {
	framesSent: number;
	isRunning: boolean;
}

interface FrameServerSessionInstance {
	getPort(): number;
	getMjpegUrl(): string;
	getWebsocketUrl(): string;
	getH264WebsocketUrl(): string;
	getFrameUrl(): string;
	pushFrame(jpegData: Buffer, timestampUs: number, width: number, height: number): void;
	pushH264Packet(data: Buffer, pts: number, dts: number, isKeyframe: boolean): void;
	getStats(): FrameServerStats;
	stop(): void;
}

interface MediaProcessorAddon {
	FrameServerSession: {
		start(config?: FrameServerConfig): FrameServerSessionInstance;
	};
}

/**
 * 帧服务器服务
 */
export class FrameServerService implements vscode.Disposable {
	private session: FrameServerSessionInstance | null = null;
	private disposed = false;

	/**
	 * 尝试创建 FrameServerService 实例
	 */
	static async tryCreate(config?: FrameServerConfig): Promise<FrameServerService | null> {
		const service = new FrameServerService();
		const initialized = await service.initialize(config);

		if (initialized) {
			return service;
		}

		await service.dispose();
		return null;
	}

	private constructor() {
		// Private constructor - use tryCreate()
	}

	/**
	 * 初始化帧服务器
	 */
	private async initialize(config?: FrameServerConfig): Promise<boolean> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const addon = require('@neko/media-processor-rs') as MediaProcessorAddon;

			this.session = addon.FrameServerSession.start(config);

			console.log(
				`[FrameServerService] Started on port ${this.session.getPort()}`
			);

			return true;
		} catch (error) {
			console.warn(
				'[FrameServerService] Failed to initialize:',
				error instanceof Error ? error.message : error
			);
			return false;
		}
	}

	/**
	 * 检查服务是否可用
	 */
	isAvailable(): boolean {
		return this.session !== null && !this.disposed;
	}

	/**
	 * 获取服务器端口
	 */
	getPort(): number | null {
		return this.session?.getPort() ?? null;
	}

	/**
	 * 获取 MJPEG 流 URL
	 */
	getMjpegUrl(): string | null {
		return this.session?.getMjpegUrl() ?? null;
	}

	/**
	 * 获取 WebSocket URL
	 */
	getWebsocketUrl(): string | null {
		return this.session?.getWebsocketUrl() ?? null;
	}

	/**
	 * 获取单帧 URL
	 */
	getFrameUrl(): string | null {
		return this.session?.getFrameUrl() ?? null;
	}

	/**
	 * 获取 H.264 WebSocket URL
	 */
	getH264WebsocketUrl(): string | null {
		return this.session?.getH264WebsocketUrl() ?? null;
	}

	/**
	 * 推送 JPEG 帧到所有连接的客户端
	 */
	pushFrame(jpegData: Buffer, timestampUs: number, width: number, height: number): void {
		if (!this.session || this.disposed) {
			return;
		}

		this.session.pushFrame(jpegData, timestampUs, width, height);
	}

	/**
	 * 推送 H.264 包到所有连接的客户端
	 *
	 * @param data H.264 NAL 单元数据
	 * @param pts 显示时间戳（微秒）
	 * @param dts 解码时间戳（微秒）
	 * @param isKeyframe 是否为关键帧
	 */
	pushH264Packet(data: Buffer, pts: number, dts: number, isKeyframe: boolean): void {
		if (!this.session || this.disposed) {
			return;
		}

		this.session.pushH264Packet(data, pts, dts, isKeyframe);
	}

	/**
	 * 获取服务器统计信息
	 */
	getStats(): FrameServerStats | null {
		if (!this.session || this.disposed) {
			return null;
		}

		return this.session.getStats();
	}

	/**
	 * 释放资源
	 */
	async dispose(): Promise<void> {
		if (this.disposed) {
			return;
		}

		this.disposed = true;

		if (this.session) {
			try {
				this.session.stop();
				console.log('[FrameServerService] Stopped');
			} catch {
				// Ignore stop errors
			}
			this.session = null;
		}
	}
}
