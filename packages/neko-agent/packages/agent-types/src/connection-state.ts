export type ConnectionServiceType = 'mcp';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

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
