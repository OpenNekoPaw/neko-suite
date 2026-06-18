import { postMessage as postRawMessage, type VSCodeAPI } from '@neko/shared/vscode';

type LiveVSCodeApi = Pick<VSCodeAPI, 'postMessage'>;

export const vscode: LiveVSCodeApi = {
  postMessage(message: unknown): void {
    postRawMessage(message);
  },
};
