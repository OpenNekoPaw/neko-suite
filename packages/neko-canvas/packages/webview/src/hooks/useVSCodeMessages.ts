/**
 * useVSCodeMessages - Handle VSCode extension ↔ webview communication
 *
 * Manages message listeners for canvas updates, keyboard actions,
 * locale changes, and media additions from the extension host.
 */

import { useEffect, useRef, useState } from 'react';
import type { CanvasData, CanvasNode } from '@neko/shared';
import { setLocale } from '../i18n';

// =============================================================================
// Types
// =============================================================================

/** VSCode API handle (only available in webview context) */
export type VSCodeAPI = {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
} | null;

export interface GenerationProgressPayload {
  nodeId: string;
  cellId?: string;
  status: 'pending' | 'generating' | 'done' | 'error';
  dataUrl?: string;
}

export interface UseVSCodeMessagesOptions {
  vscode: VSCodeAPI;
  defaultCanvasData: CanvasData;
  setCanvasData: (data: CanvasData) => void;
  onAddMediaFromExtension: (mediaType: string, uri: string, name: string) => void;
  onDropMedia: (files: Array<{ uri: string; name: string; mediaType: string }>) => void;
  /** Called when generation status/image arrives from the extension scheduler */
  onGenerationProgress?: (payload: GenerationProgressPayload) => void;
  /** Called with the AI-built prompt string for AutoPrompt */
  onBuildPromptResult?: (prompt: string) => void;
  /** Called when scene TOC is available for a ScriptNode */
  onScriptIndexResult?: (nodeId: string, scenes: unknown[]) => void;
  /** Called when model install status is known */
  onModelInstalledResult?: (nodeId: string, installedVersion: string | null) => void;
  /** Return all nodes (optionally filtered by type) — used to respond to nodes.list requests */
  getNodes?: (type?: string) => CanvasNode[];
  /** Return a single node by id — used to respond to nodes.get requests */
  getNode?: (id: string) => CanvasNode | undefined;
  /** Update a node — used to respond to nodes.update requests */
  updateNode?: (id: string, updates: Partial<CanvasNode>) => void;
  /** Create a node — used to respond to nodes.create requests */
  createNode?: (node: Omit<CanvasNode, 'id'>) => string;
  /** Called when the Sketch round-trip sends an edited image back to a canvas node */
  onUpdateNodeImage?: (nodeId: string, imageData: string, cellId?: string) => void;
}

export interface UseVSCodeMessagesReturn {
  isReady: boolean;
  keyboardActionRef: React.MutableRefObject<(action: string) => void>;
}

// =============================================================================
// Hook
// =============================================================================

export function useVSCodeMessages(options: UseVSCodeMessagesOptions): UseVSCodeMessagesReturn {
  const {
    vscode,
    defaultCanvasData,
    setCanvasData,
    onAddMediaFromExtension,
    onDropMedia,
    onGenerationProgress,
    onBuildPromptResult,
    onScriptIndexResult,
    onModelInstalledResult,
    getNodes,
    getNode,
    updateNode,
    createNode,
    onUpdateNodeImage,
  } = options;

  const [isReady, setIsReady] = useState(false);
  const keyboardActionRef = useRef<(action: string) => void>(() => {});

  // Stable refs for callbacks to avoid re-registering listener
  const onAddMediaRef = useRef(onAddMediaFromExtension);
  onAddMediaRef.current = onAddMediaFromExtension;
  const onDropMediaRef = useRef(onDropMedia);
  onDropMediaRef.current = onDropMedia;
  const onGenerationProgressRef = useRef(onGenerationProgress);
  onGenerationProgressRef.current = onGenerationProgress;
  const onBuildPromptResultRef = useRef(onBuildPromptResult);
  onBuildPromptResultRef.current = onBuildPromptResult;
  const onScriptIndexResultRef = useRef(onScriptIndexResult);
  onScriptIndexResultRef.current = onScriptIndexResult;
  const onModelInstalledResultRef = useRef(onModelInstalledResult);
  onModelInstalledResultRef.current = onModelInstalledResult;
  const getNodesRef = useRef(getNodes);
  getNodesRef.current = getNodes;
  const getNodeRef = useRef(getNode);
  getNodeRef.current = getNode;
  const updateNodeRef = useRef(updateNode);
  updateNodeRef.current = updateNode;
  const createNodeRef = useRef(createNode);
  createNodeRef.current = createNode;
  const onUpdateNodeImageRef = useRef(onUpdateNodeImage);
  onUpdateNodeImageRef.current = onUpdateNodeImage;

  useEffect(() => {
    if (vscode) {
      const handleMessage = (event: MessageEvent) => {
        const message = event.data;
        switch (message.type) {
          case 'update':
            if (message.data) {
              setCanvasData(message.data as CanvasData);
            }
            setIsReady(true);
            break;
          case 'keyboardAction':
            keyboardActionRef.current(message.action as string);
            break;
          case 'setLocale':
            setLocale(message.locale as 'en' | 'zh-cn');
            break;
          case 'addMedia':
            onAddMediaRef.current(
              message.mediaType as string,
              message.uri as string,
              message.name as string,
            );
            break;
          case 'dropMedia': {
            const files = message.files as Array<{
              uri: string;
              name: string;
              mediaType: string;
            }>;
            onDropMediaRef.current(files);
            break;
          }
          case 'generationProgress':
            onGenerationProgressRef.current?.({
              nodeId: message.nodeId as string,
              cellId: message.cellId as string | undefined,
              status: message.status as GenerationProgressPayload['status'],
              dataUrl: message.dataUrl as string | undefined,
            });
            break;
          case 'buildPromptResult':
            onBuildPromptResultRef.current?.(message.prompt as string);
            break;
          case 'scriptIndexResult':
            onScriptIndexResultRef.current?.(message.nodeId as string, message.scenes as unknown[]);
            break;
          case 'modelInstalledResult':
            onModelInstalledResultRef.current?.(
              message.nodeId as string,
              (message.installedVersion as string | null) ?? null,
            );
            break;

          // ----------------------------------------------------------------
          // nodes.* — request/response API for MCP Canvas tools
          // The extension sends { type, _requestId, ...payload } and expects
          // { type: '_response', _requestId, ...result } back.
          // ----------------------------------------------------------------
          case 'nodes.list': {
            const requestId = message._requestId as number | undefined;
            if (requestId === undefined) break;
            const typeFilter = message.nodeType as string | undefined;
            const nodes = getNodesRef.current?.(typeFilter) ?? [];
            vscode.postMessage({ type: '_response', _requestId: requestId, nodes });
            break;
          }
          case 'nodes.get': {
            const requestId = message._requestId as number | undefined;
            if (requestId === undefined) break;
            const node = getNodeRef.current?.(message.nodeId as string) ?? null;
            vscode.postMessage({ type: '_response', _requestId: requestId, node });
            break;
          }
          case 'nodes.update': {
            const requestId = message._requestId as number | undefined;
            if (requestId === undefined) break;
            updateNodeRef.current?.(
              message.nodeId as string,
              message.updates as Partial<CanvasNode>,
            );
            vscode.postMessage({ type: '_response', _requestId: requestId, success: true });
            break;
          }
          case 'nodes.create': {
            const requestId = message._requestId as number | undefined;
            if (requestId === undefined) break;
            const id = createNodeRef.current?.(message.node as Omit<CanvasNode, 'id'>) ?? '';
            vscode.postMessage({ type: '_response', _requestId: requestId, nodeId: id });
            break;
          }

          // Round-trip: Sketch sends back an edited image for a canvas shot node
          case 'updateNodeImage':
            onUpdateNodeImageRef.current?.(
              message.nodeId as string,
              message.imageData as string,
              message.cellId as string | undefined,
            );
            break;
        }
      };

      window.addEventListener('message', handleMessage);
      vscode.postMessage({ type: 'ready' });

      return () => {
        window.removeEventListener('message', handleMessage);
      };
    } else {
      setCanvasData(defaultCanvasData);
      setIsReady(true);
    }
  }, [vscode, setCanvasData, defaultCanvasData]);

  return { isReady, keyboardActionRef };
}
