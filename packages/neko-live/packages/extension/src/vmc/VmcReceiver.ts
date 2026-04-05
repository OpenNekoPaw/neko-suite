/**
 * VMC (Virtual Motion Capture) protocol receiver.
 *
 * Listens for OSC messages over UDP sent by external tracking software
 * (VSeeFace, iFacialMocap, VMagicMirror, etc.) and emits unified
 * TrackingData events.
 *
 * VMC protocol reference: https://protocol.vmc.info/
 */

import { EventEmitter } from 'events';
import * as dgram from 'dgram';
import type { ILogger } from '@neko/shared';
import { parseOscPacket, type OscMessage } from './osc-parser';

// Reuse the same TrackingData shape as webview types, but inline here
// to avoid cross-package dependency (extension cannot import webview types)
export interface VmcTrackingData {
  source: 'vmc';
  timestamp: number;
  blendShapes: Record<string, number>;
  headRotation?: readonly [number, number, number, number];
  headPosition?: readonly [number, number, number];
  boneTransforms?: Record<
    string,
    {
      rotation: readonly [number, number, number, number];
      position?: readonly [number, number, number];
    }
  >;
}

export interface VmcReceiverEvents {
  tracking: [data: VmcTrackingData];
  error: [error: Error];
  started: [];
  stopped: [];
}

export class VmcReceiver extends EventEmitter<VmcReceiverEvents> {
  private socket: dgram.Socket | undefined;
  private _isRunning = false;
  private readonly logger: ILogger;

  // Per-frame accumulators (VMC sends blend shapes one at a time, then Apply)
  private pendingBlendShapes: Record<string, number> = {};
  private pendingBones: Record<
    string,
    {
      rotation: readonly [number, number, number, number];
      position?: readonly [number, number, number];
    }
  > = {};
  private headRotation: readonly [number, number, number, number] | undefined;
  private headPosition: readonly [number, number, number] | undefined;

  // FPS measurement
  private frameCount = 0;
  private lastFpsTime = 0;
  private _fps = 0;

  constructor(
    private readonly port: number,
    logger: ILogger,
  ) {
    super();
    this.logger = logger.child('VMC');
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get fps(): number {
    return this._fps;
  }

  async start(): Promise<void> {
    if (this._isRunning) return;

    this.socket = dgram.createSocket('udp4');

    this.socket.on('message', (msg: Buffer) => {
      try {
        this.handlePacket(msg);
      } catch (err) {
        this.logger.error('Failed to parse VMC packet', err);
      }
    });

    this.socket.on('error', (err: Error) => {
      this.logger.error('UDP socket error', err);
      this.emit('error', err);
    });

    await new Promise<void>((resolve, reject) => {
      this.socket!.bind(this.port, () => {
        this._isRunning = true;
        this.lastFpsTime = Date.now();
        this.frameCount = 0;
        this.logger.info(`Listening on UDP port ${this.port}`);
        this.emit('started');
        resolve();
      });

      this.socket!.once('error', reject);
    });
  }

  stop(): void {
    if (!this._isRunning || !this.socket) return;

    this._isRunning = false;
    this.socket.close();
    this.socket = undefined;
    this.resetAccumulators();
    this.logger.info('Stopped');
    this.emit('stopped');
  }

  private handlePacket(buf: Buffer): void {
    const messages = parseOscPacket(buf);

    for (const msg of messages) {
      this.handleMessage(msg);
    }
  }

  private handleMessage(msg: OscMessage): void {
    switch (msg.address) {
      case '/VMC/Ext/Blend/Val':
        this.handleBlendVal(msg);
        break;

      case '/VMC/Ext/Blend/Apply':
        this.flushFrame();
        break;

      case '/VMC/Ext/Bone/Pos':
        this.handleBonePos(msg);
        break;

      case '/VMC/Ext/Root/Pos':
        this.handleRootPos(msg);
        break;

      // Other VMC addresses can be added as needed
      default:
        break;
    }
  }

  /** /VMC/Ext/Blend/Val: [string name, float value] */
  private handleBlendVal(msg: OscMessage): void {
    if (msg.args.length < 2) return;
    const nameArg = msg.args[0];
    const valueArg = msg.args[1];
    if (nameArg?.type !== 's' || valueArg?.type !== 'f') return;

    this.pendingBlendShapes[nameArg.value] = valueArg.value;
  }

  /** /VMC/Ext/Bone/Pos: [string name, float px, py, pz, float qx, qy, qz, qw] */
  private handleBonePos(msg: OscMessage): void {
    if (msg.args.length < 8) return;
    const nameArg = msg.args[0];
    if (nameArg?.type !== 's') return;

    const floats = msg.args.slice(1);
    if (floats.some((a) => a.type !== 'f')) return;

    const values = floats.map((a) => (a as { type: 'f'; value: number }).value);
    const name = nameArg.value;
    const position = [values[0]!, values[1]!, values[2]!] as const;
    const rotation = [values[3]!, values[4]!, values[5]!, values[6]!] as const;

    // Track Head bone separately for convenience
    if (name === 'Head') {
      this.headRotation = rotation;
      this.headPosition = position;
    }

    this.pendingBones[name] = { rotation, position };
  }

  /** /VMC/Ext/Root/Pos: root transform (hips position/rotation) */
  private handleRootPos(msg: OscMessage): void {
    if (msg.args.length < 8) return;
    const nameArg = msg.args[0];
    if (nameArg?.type !== 's') return;

    const floats = msg.args.slice(1);
    if (floats.some((a) => a.type !== 'f')) return;

    const values = floats.map((a) => (a as { type: 'f'; value: number }).value);
    const position = [values[0]!, values[1]!, values[2]!] as const;
    const rotation = [values[3]!, values[4]!, values[5]!, values[6]!] as const;

    this.pendingBones[nameArg.value] = { rotation, position };
  }

  /** Emit accumulated frame and reset accumulators */
  private flushFrame(): void {
    const data: VmcTrackingData = {
      source: 'vmc',
      timestamp: Date.now(),
      blendShapes: { ...this.pendingBlendShapes },
      headRotation: this.headRotation,
      headPosition: this.headPosition,
      boneTransforms:
        Object.keys(this.pendingBones).length > 0 ? { ...this.pendingBones } : undefined,
    };

    this.emit('tracking', data);
    this.updateFps();
    this.resetAccumulators();
  }

  private resetAccumulators(): void {
    this.pendingBlendShapes = {};
    this.pendingBones = {};
    this.headRotation = undefined;
    this.headPosition = undefined;
  }

  private updateFps(): void {
    this.frameCount++;
    const now = Date.now();
    const elapsed = now - this.lastFpsTime;
    if (elapsed >= 1000) {
      this._fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFpsTime = now;
    }
  }
}
