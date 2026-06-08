import {
  normalizeNarrativePreviewFeatureToggles,
  type CanvasToPreviewMessage,
  type NarrativePreviewFeatureToggles,
  type PreviewToCanvasMessage,
  type StoryGenre,
} from '@neko/shared';
import { NarrativeRuntime } from './NarrativeRuntime';
import type {
  NarrativePreviewAdapterPort,
  NarrativePreviewController,
  NarrativeRuntimeState,
} from './types';

export class DefaultNarrativePreviewController implements NarrativePreviewController {
  private latestRevision = 0;
  private runtime = new NarrativeRuntime();
  private currentGenre: StoryGenre = 'illustrated-text';
  private currentFeatureToggles = normalizeNarrativePreviewFeatureToggles(undefined);
  private isFullscreen = false;
  private isVariablesPanelOpen = false;
  private isHistoryPanelOpen = false;

  constructor(private readonly port?: NarrativePreviewAdapterPort) {}

  get state(): NarrativeRuntimeState {
    return this.runtime.state;
  }

  get genre(): StoryGenre {
    return this.currentGenre;
  }

  get featureToggles(): NarrativePreviewFeatureToggles {
    return this.currentFeatureToggles;
  }

  get fullscreen(): boolean {
    return this.isFullscreen;
  }

  get variablesPanelOpen(): boolean {
    return this.isVariablesPanelOpen;
  }

  get historyPanelOpen(): boolean {
    return this.isHistoryPanelOpen;
  }

  handleMessage(message: CanvasToPreviewMessage): boolean {
    const revision = readMessageRevision(message);
    if (revision !== undefined && revision < this.latestRevision) {
      return false;
    }
    if (revision !== undefined) {
      this.latestRevision = revision;
    }

    switch (message.type) {
      case 'preview:loadGraph':
      case 'preview:refresh':
        this.runtime.load(message.snapshot);
        this.currentGenre = message.snapshot.metadata.genre ?? this.currentGenre;
        this.runtime.start();
        this.emitHighlight();
        return true;
      case 'preview:jumpTo':
        if (!this.currentFeatureToggles.previewAutoSync) {
          return true;
        }
        this.runtime.jumpTo(message.nodeId);
        this.emitHighlight();
        return true;
      case 'preview:setVariables':
        this.runtime.setVariables(message.variables);
        return true;
      case 'preview:setGenre':
        this.currentGenre = message.genre;
        return true;
      case 'preview:setFeatureToggles':
        this.setFeatureToggles(message.toggles);
        return true;
    }
  }

  start(): void {
    this.runtime.start();
    this.emitHighlight();
  }

  reset(): void {
    this.runtime.reset();
  }

  advance(choiceIndex?: number): void {
    const previousNodeId = this.runtime.state.currentNode?.nodeId;
    this.runtime.advance(choiceIndex);
    const nextNodeId = this.runtime.state.currentNode?.nodeId;
    if (previousNodeId && nextNodeId && previousNodeId !== nextNodeId) {
      this.post({
        type: 'canvas:choiceMade',
        requestId: createRequestId('choice'),
        fromNodeId: previousNodeId,
        toNodeId: nextNodeId,
      });
    }
    this.emitHighlight();
  }

  stepBack(): void {
    this.runtime.stepBack();
    this.emitHighlight();
  }

  jumpTo(nodeId: string): void {
    this.runtime.jumpTo(nodeId);
    this.emitHighlight();
  }

  setGenre(genre: StoryGenre): void {
    this.currentGenre = genre;
  }

  setFeatureToggles(toggles: Partial<NarrativePreviewFeatureToggles>): void {
    this.currentFeatureToggles = normalizeNarrativePreviewFeatureToggles({
      ...this.currentFeatureToggles,
      ...toggles,
    });
  }

  setVariables(variables: Readonly<Record<string, unknown>>): void {
    this.runtime.setVariables(variables);
  }

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
  }

  toggleVariablesPanel(): void {
    this.isVariablesPanelOpen = !this.isVariablesPanelOpen;
  }

  toggleHistoryPanel(): void {
    this.isHistoryPanelOpen = !this.isHistoryPanelOpen;
  }

  private emitHighlight(): void {
    if (!this.currentFeatureToggles.previewAutoSync) return;

    const nodeId = this.runtime.state.currentNode?.nodeId;
    if (nodeId) {
      this.post({ type: 'canvas:highlightNode', requestId: createRequestId('node'), nodeId });
    }
    if (this.runtime.state.path.length > 0) {
      this.post({
        type: 'canvas:highlightPath',
        requestId: createRequestId('path'),
        nodeIds: this.runtime.state.path,
      });
    }
  }

  private post(message: PreviewToCanvasMessage): void {
    this.port?.postMessage(message);
  }
}

function readMessageRevision(message: CanvasToPreviewMessage): number | undefined {
  return 'revision' in message ? message.revision : undefined;
}

function createRequestId(reason: string): string {
  return `story-preview:${reason}:${Date.now()}`;
}
