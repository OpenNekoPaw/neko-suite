import { getVSCodeAPI } from '@neko/shared/vscode';

export interface IWebviewBridge {
  postMessage(message: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
  subscribe(listener: (message: unknown) => void): () => void;
}

class VSCodeWebviewBridge implements IWebviewBridge {
  postMessage(message: unknown): void {
    getVSCodeAPI()?.postMessage(message);
  }

  getState<T>(): T | undefined {
    return getVSCodeAPI()?.getState<T>();
  }

  setState<T>(state: T): void {
    getVSCodeAPI()?.setState(state);
  }

  subscribe(listener: (message: unknown) => void): () => void {
    const handler = (event: MessageEvent<unknown>) => {
      listener(event.data);
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }
}

const bridge = new VSCodeWebviewBridge();

export function getWebviewBridge(): IWebviewBridge {
  return bridge;
}
