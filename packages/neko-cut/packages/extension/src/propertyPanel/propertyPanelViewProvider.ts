/**
 * Property Panel View Provider
 * Provides the PropertyPanel as a webview view in the secondary sidebar
 */

import * as vscode from 'vscode';
import type { TimelineElement, EasingType, ProjectDefaults } from '@neko/shared';

/**
 * Message types for communication between main editor and property panel
 */
export interface PropertyPanelMessage {
  type: string;
  [key: string]: unknown;
}

export interface SelectedElementMessage extends PropertyPanelMessage {
  type: 'selectedElement';
  element: TimelineElement | null;
  trackId: string | null;
  currentTime: number;
}

export interface ProjectDefaultsMessage extends PropertyPanelMessage {
  type: 'projectDefaults';
  defaults: ProjectDefaults | null;
}

export interface ElementPropertyChangeMessage extends PropertyPanelMessage {
  type: 'elementPropertyChange';
  trackId: string;
  elementId: string;
  changes: Partial<TimelineElement>;
}

export interface DefaultsPropertyChangeMessage extends PropertyPanelMessage {
  type: 'defaultsPropertyChange';
  changes: Partial<ProjectDefaults>;
}

export interface AddKeyframeMessage extends PropertyPanelMessage {
  type: 'addKeyframe';
  trackId: string;
  elementId: string;
  propertyPath: string;
  value: number;
  easing?: EasingType;
}

export interface RemoveKeyframeMessage extends PropertyPanelMessage {
  type: 'removeKeyframe';
  trackId: string;
  elementId: string;
  propertyPath: string;
}

export class PropertyPanelViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'uniedit.propertyPanel';

  private _view?: vscode.WebviewView;
  private _selectedElement: TimelineElement | null = null;
  private _selectedTrackId: string | null = null;
  private _currentTime: number = 0;
  private _projectDefaults: ProjectDefaults | null = null;

  // Event emitter for property changes
  private readonly _onDidChangeProperty = new vscode.EventEmitter<ElementPropertyChangeMessage>();
  public readonly onDidChangeProperty = this._onDidChangeProperty.event;

  // Event emitter for defaults changes
  private readonly _onDidChangeDefaults = new vscode.EventEmitter<DefaultsPropertyChangeMessage>();
  public readonly onDidChangeDefaults = this._onDidChangeDefaults.event;

  // Event emitter for keyframe operations
  private readonly _onDidAddKeyframe = new vscode.EventEmitter<AddKeyframeMessage>();
  public readonly onDidAddKeyframe = this._onDidAddKeyframe.event;

  private readonly _onDidRemoveKeyframe = new vscode.EventEmitter<RemoveKeyframeMessage>();
  public readonly onDidRemoveKeyframe = this._onDidRemoveKeyframe.event;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext
  ) {}

  /**
   * Resolve the webview view when it becomes visible
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    this._setupMessageHandlers(webviewView.webview);

    // Restore state when view becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._sendSelectedElement();
        this._sendProjectDefaults();
      }
    });
  }

  /**
   * Update the selected element from the main editor
   */
  public updateSelectedElement(
    element: TimelineElement | null,
    trackId: string | null,
    currentTime: number
  ): void {
    this._selectedElement = element;
    this._selectedTrackId = trackId;
    this._currentTime = currentTime;
    this._sendSelectedElement();
  }

  /**
   * Update project defaults
   */
  public updateProjectDefaults(defaults: ProjectDefaults | null): void {
    this._projectDefaults = defaults;
    this._sendProjectDefaults();
  }

  /**
   * Update just the current time (for animation preview)
   */
  public updateCurrentTime(currentTime: number): void {
    this._currentTime = currentTime;
    if (this._view) {
      this._view.webview.postMessage({
        type: 'currentTimeUpdate',
        currentTime,
      });
    }
  }

  /**
   * Set up message handlers for webview communication
   */
  private _setupMessageHandlers(webview: vscode.Webview): void {
    webview.onDidReceiveMessage((message: PropertyPanelMessage) => {
      switch (message.type) {
        case 'ready':
          // Webview is ready, send current state
          this._sendSelectedElement();
          this._sendProjectDefaults();
          break;

        case 'propertyChange':
          // Property was changed in the panel
          if (this._selectedTrackId && this._selectedElement) {
            const changeMessage: ElementPropertyChangeMessage = {
              type: 'elementPropertyChange',
              trackId: this._selectedTrackId,
              elementId: this._selectedElement.id,
              changes: message.changes as Partial<TimelineElement>,
            };
            this._onDidChangeProperty.fire(changeMessage);
          }
          break;

        case 'defaultsChange':
          // Defaults were changed in the panel
          const defaultsChangeMessage: DefaultsPropertyChangeMessage = {
            type: 'defaultsPropertyChange',
            changes: message.changes as Partial<ProjectDefaults>,
          };
          this._onDidChangeDefaults.fire(defaultsChangeMessage);
          break;

        case 'addKeyframe':
          // Add keyframe was requested
          if (this._selectedTrackId && this._selectedElement) {
            const keyframeMessage: AddKeyframeMessage = {
              type: 'addKeyframe',
              trackId: this._selectedTrackId,
              elementId: this._selectedElement.id,
              propertyPath: message.propertyPath as string,
              value: message.value as number,
              easing: message.easing as EasingType | undefined,
            };
            this._onDidAddKeyframe.fire(keyframeMessage);
          }
          break;

        case 'removeKeyframe':
          // Remove keyframe was requested
          if (this._selectedTrackId && this._selectedElement) {
            const removeMessage: RemoveKeyframeMessage = {
              type: 'removeKeyframe',
              trackId: this._selectedTrackId,
              elementId: this._selectedElement.id,
              propertyPath: message.propertyPath as string,
            };
            this._onDidRemoveKeyframe.fire(removeMessage);
          }
          break;
      }
    });
  }

  /**
   * Send the currently selected element to the webview
   */
  private _sendSelectedElement(): void {
    if (!this._view) return;

    this._view.webview.postMessage({
      type: 'selectedElement',
      element: this._selectedElement,
      trackId: this._selectedTrackId,
      currentTime: this._currentTime,
    });
  }

  /**
   * Send the project defaults to the webview
   */
  private _sendProjectDefaults(): void {
    if (!this._view) {
      return;
    }

    this._view.webview.postMessage({
      type: 'projectDefaults',
      defaults: this._projectDefaults,
    });
  }

  /**
   * Generate HTML for the webview
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    const locale = vscode.env.language;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'propertyPanel.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'style.css')
    );

    return `<!DOCTYPE html>
<html lang="${locale}" data-vscode-locale="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Properties</title>
  <link rel="stylesheet" type="text/css" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.vscodeApi = acquireVsCodeApi();
  </script>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this._onDidChangeProperty.dispose();
    this._onDidChangeDefaults.dispose();
    this._onDidAddKeyframe.dispose();
    this._onDidRemoveKeyframe.dispose();
  }
}

/**
 * Generate a random nonce for CSP
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
