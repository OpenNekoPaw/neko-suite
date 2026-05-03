import type { ProtocolConnectionStatus } from './webview-protocol';

export type ConnectionServiceType = 'mcp';
export type ConnectionStatus = ProtocolConnectionStatus;

export interface ConnectionState {
  id: string;
  name: string;
  type: ConnectionServiceType;
  status: ConnectionStatus;
  error?: string;
  lastChecked?: number;
}

export interface ConnectionStateChangeEvent {
  id: string;
  type: ConnectionServiceType;
  oldStatus: ConnectionStatus;
  newStatus: ConnectionStatus;
  error?: string;
}

export type ConnectionStateListener = (event: ConnectionStateChangeEvent) => void;
