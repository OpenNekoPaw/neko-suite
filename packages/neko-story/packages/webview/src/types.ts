/**
 * Fountain element types for webview rendering
 * Simplified version of @neko-story/types for webview bundle size
 */

import type { NekoStoryScriptIndex, StorySceneVideoReadiness } from '@neko/shared';

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export type ElementType =
  | 'title_page'
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'centered'
  | 'section'
  | 'synopsis'
  | 'note'
  | 'page_break'
  | 'lyrics';

export interface FountainElement {
  type: ElementType;
  range: Range;
  raw: string;
}

export interface TitlePageEntry {
  key: string;
  value: string;
}

export interface TitlePage extends FountainElement {
  type: 'title_page';
  entries: TitlePageEntry[];
}

export interface SceneHeading extends FountainElement {
  type: 'scene_heading';
  intExt: 'INT' | 'EXT' | 'INT/EXT' | 'I/E' | 'EST' | null;
  location: string;
  time: string | null;
  sceneNumber: string | null;
}

export interface Action extends FountainElement {
  type: 'action';
  text: string;
  centered: boolean;
}

export interface Character extends FountainElement {
  type: 'character';
  name: string;
  extension: string | null;
  isDualDialogue: boolean;
}

export interface Dialogue extends FountainElement {
  type: 'dialogue';
  text: string;
}

export interface Parenthetical extends FountainElement {
  type: 'parenthetical';
  text: string;
}

export interface Transition extends FountainElement {
  type: 'transition';
  text: string;
}

export interface Centered extends FountainElement {
  type: 'centered';
  text: string;
}

export interface Section extends FountainElement {
  type: 'section';
  level: number;
  text: string;
}

export interface Synopsis extends FountainElement {
  type: 'synopsis';
  text: string;
}

export interface AssetReference {
  type: 'image' | 'video' | 'audio';
  path: string;
}

export interface Note extends FountainElement {
  type: 'note';
  text: string;
  assetRef?: AssetReference;
  /** Resolved webview URI, injected by PreviewPanel before sending */
  resolvedUri?: string;
}

export interface PageBreak extends FountainElement {
  type: 'page_break';
}

export interface Lyrics extends FountainElement {
  type: 'lyrics';
  text: string;
}

export type AnyFountainElement =
  | TitlePage
  | SceneHeading
  | Action
  | Character
  | Dialogue
  | Parenthetical
  | Transition
  | Centered
  | Section
  | Synopsis
  | Note
  | PageBreak
  | Lyrics;

export interface FountainDocument {
  titlePage: TitlePage | null;
  elements: AnyFountainElement[];
}

export type StoryAgentStatus =
  | 'not-requested'
  | 'ready'
  | 'review'
  | 'parsing'
  | 'prompt-review'
  | 'pilot-review'
  | 'generating'
  | 'timeline-arranged'
  | 'sent'
  | 'skipped'
  | 'failed';

export type StoryCanvasStatus = 'not-sent' | 'queued' | 'sent' | 'opened' | 'skipped';

export interface StorySceneState {
  readonly sceneId: string;
  readonly agentStatus: StoryAgentStatus;
  readonly canvasStatus: StoryCanvasStatus;
  readonly generationStatus?: 'idle' | 'generating' | 'done' | 'partial-fail';
  readonly timelineStatus?: 'not-arranged' | 'arranged';
  readonly lastError?: string;
}

export type StorySceneAction =
  | 'analyze'
  | 'generateStoryboard'
  | 'sendToCanvas'
  | 'openCanvas'
  | 'toggleSkip'
  | 'startVideoCreation'
  | 'generateCurrentScene'
  | 'retryFailed';

export type StoryTableAction = 'startVideoCreationAll' | 'sendToAgentAll' | 'sendToCanvasAll';

export interface StoryTableActionScope {
  readonly sceneIds?: readonly string[];
  readonly includeSkipped?: boolean;
}

// Message types for VSCode communication
export type StoryViewMode = 'screenplay' | 'table';

export type MessageToWebview =
  | {
      type: 'update';
      document: FountainDocument;
      scriptIndex: NekoStoryScriptIndex;
      sceneStates: Record<string, StorySceneState>;
      readinessRows?: readonly StorySceneVideoReadiness[];
    }
  | { type: 'scrollTo'; line: number }
  | { type: 'setView'; view: StoryViewMode }
  | { type: 'characterThumbnails'; data: Record<string, string> };

export type MessageToExtension =
  | { type: 'ready' }
  | { type: 'navigate'; line: number; character: number }
  | { type: 'scroll'; line: number }
  | { type: 'sceneAction'; sceneId: string; action: StorySceneAction }
  | { type: 'tableAction'; action: StoryTableAction; scope?: StoryTableActionScope }
  | { type: 'characterSendToAgent'; name: string; sceneId?: string; characterId?: string }
  | { type: 'characterNavigate'; name: string; sceneId?: string; characterId?: string };
