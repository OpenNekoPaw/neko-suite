import { postMessage as postRawMessage, type VSCodeAPI } from '@neko/shared/vscode';

export type SketchVSCodeApi = VSCodeAPI;

export function postSketchMessage(message: unknown): void {
  postRawMessage(message);
}
