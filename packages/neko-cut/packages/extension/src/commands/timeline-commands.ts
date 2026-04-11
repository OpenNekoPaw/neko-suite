/**
 * Timeline Commands
 * VSCode commands for timeline operations.
 *
 * Uses TimelineToolExecutor (extension-side ProjectData transforms) instead of
 * the broken TimelineBridge that sent messages to the webview with no receiver.
 * This resolves NKC-002.
 */

import * as vscode from 'vscode';
import type { VideoEditorProvider } from '../editor/video/videoEditorProvider';
import { TimelineToolExecutor } from '../services/TimelineToolExecutor';
import type { TimelineToolResult } from '../bootstrap/toolsBootstrap';
import { handleError } from '../base';

/**
 * Register timeline-related VSCode commands
 */
export function registerTimelineCommands(
  context: vscode.ExtensionContext,
  _videoEditorProvider: VideoEditorProvider,
): void {
  const executor = new TimelineToolExecutor();

  /**
   * Execute a timeline tool via the extension-side TimelineToolExecutor.
   * Returns a TimelineToolResult for API compatibility.
   */
  async function executeTool<T = unknown>(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<TimelineToolResult<T>> {
    const result = await executor.execute(toolName, params);
    return {
      success: result.success,
      data: result.data as T | undefined,
      error: result.error,
    };
  }

  // Timeline Info Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.timeline.getInfo', () =>
      executeTool('GetTimelineInfo', {}),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.timeline.listElements', (trackType?: string) =>
      executeTool('ListElements', { trackType }),
    ),
  );

  // Element Commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.element.add',
      (params: {
        type: string;
        trackId?: string;
        startTime?: number;
        duration?: number;
        properties?: Record<string, unknown>;
      }) => executeTool('AddElement', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.element.update',
      (params: { elementId: string; properties: Record<string, unknown> }) =>
        executeTool('UpdateElement', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.element.delete', (elementId: string) =>
      executeTool('DeleteElement', { elementId }),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.element.getInfo', (elementId: string) =>
      executeTool('GetElementInfo', { elementId }),
    ),
  );

  // Track Commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.track.add',
      (params: { type: string; name?: string; index?: number }) => executeTool('AddTrack', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.track.delete', (trackId: string) =>
      executeTool('DeleteTrack', { trackId }),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.track.reorder',
      (params: { trackId: string; newIndex: number }) => executeTool('ReorderTracks', params),
    ),
  );

  // Effect Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.effect.list', () => executeTool('ListEffects', {})),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.effect.add',
      (params: { elementId: string; effectType: string; parameters?: Record<string, unknown> }) =>
        executeTool('AddEffect', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.effect.update',
      (params: { elementId: string; effectId: string; params: Record<string, unknown> }) =>
        executeTool('UpdateEffect', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.effect.remove',
      (params: { elementId: string; effectId: string }) => executeTool('RemoveEffect', params),
    ),
  );

  // Transition Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.transition.list', () =>
      executeTool('ListTransitions', {}),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.transition.add',
      (params: {
        elementId: string;
        transitionType: string;
        duration?: number;
        position?: 'in' | 'out';
      }) => executeTool('SetTransition', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.transition.remove',
      (params: { elementId: string; placement: 'in' | 'out' }) =>
        executeTool('RemoveTransition', params),
    ),
  );

  // Mask Commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.mask.add',
      (params: { elementId: string; maskType: string; params: Record<string, unknown> }) =>
        executeTool('AddMask', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.mask.update',
      (params: { elementId: string; maskId: string; params: Record<string, unknown> }) =>
        executeTool('UpdateMask', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.mask.remove',
      (params: { elementId: string; maskId: string }) => executeTool('RemoveMask', params),
    ),
  );

  // Keyframe Commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.keyframe.get',
      (params: { elementId: string; property?: string }) => executeTool('GetKeyframes', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.keyframe.add',
      (params: {
        elementId: string;
        property: string;
        time: number;
        value: unknown;
        easing?: string;
      }) => executeTool('AddKeyframe', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.keyframe.update',
      (params: {
        elementId: string;
        keyframeId: string;
        time?: number;
        value?: unknown;
        easing?: string;
      }) => executeTool('UpdateKeyframe', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.keyframe.remove',
      (params: { elementId: string; keyframeId: string }) => executeTool('RemoveKeyframe', params),
    ),
  );

  // Shape Commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.shape.add',
      (params: {
        trackId: string;
        shapeType: string;
        name?: string;
        position?: { x?: number; y?: number };
        size?: { width?: number; height?: number };
        style?: Record<string, unknown>;
        transform?: Record<string, unknown>;
      }) => executeTool('AddShape', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.shape.update',
      (params: {
        shapeId?: string;
        elementId?: string;
        position?: { x?: number; y?: number };
        size?: { width?: number; height?: number };
        style?: Record<string, unknown>;
        visible?: boolean;
        locked?: boolean;
      }) => executeTool('UpdateShape', params),
    ),
  );

  // Color Correction Commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.color.set',
      (params: {
        elementId: string;
        brightness?: number;
        contrast?: number;
        saturation?: number;
        temperature?: number;
        tint?: number;
        gamma?: number;
      }) => executeTool('SetColorCorrection', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.color.reset', (elementId: string) =>
      executeTool('ResetColorCorrection', { elementId }),
    ),
  );

  // Audio Commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.audio.setProperties',
      (params: {
        elementId: string;
        volume?: number;
        pan?: number;
        muted?: boolean;
        fadeIn?: number;
        fadeOut?: number;
      }) => executeTool('SetAudioProperties', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.audio.addKeyframe',
      (params: { elementId: string; property: 'volume' | 'pan'; time: number; value: number }) =>
        executeTool('AddAudioKeyframe', params),
    ),
  );

  // Track Properties Command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.track.setProperties',
      (params: {
        trackId: string;
        name?: string;
        muted?: boolean;
        locked?: boolean;
        solo?: boolean;
      }) => executeTool('SetTrackProperties', params),
    ),
  );

  // Media Separate Audio Command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.media.separateAudio',
      (params: { elementId: string; targetTrackId?: string }) =>
        executeTool('SeparateAudio', params),
    ),
  );

  // Export Progress Command (uses ExportService directly)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.export.getProgress', async () => {
      const exportService = _videoEditorProvider.getActiveExportService();
      if (!exportService) {
        return { success: false, error: 'No export service available' };
      }
      const progress = await exportService.getProgress();
      return { success: true, data: progress };
    }),
  );

  // Animation Commands (existing add_animation -> add_keyframe)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.animation.add',
      (params: {
        elementId: string;
        property: string;
        keyframes: Array<{ time: number; value: unknown; easing?: string }>;
      }) => executeTool('AddAnimation', params),
    ),
  );

  // Subtitle Commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.subtitle.add',
      (params: {
        text: string;
        startTime: number;
        endTime: number;
        style?: Record<string, unknown>;
      }) => executeTool('AddSubtitle', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.subtitle.import',
      (params: { format: 'srt' | 'vtt' | 'ass'; content: string }) =>
        executeTool('ImportSubtitles', params),
    ),
  );

  // Media Operation Commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.media.trim',
      (params: { elementId: string; startTime: number; endTime: number }) =>
        executeTool('TrimMedia', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.media.split',
      (params: { elementId: string; splitTime: number }) => executeTool('SplitMedia', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.media.setSpeed',
      (params: { elementId: string; speed: number }) => executeTool('SetPlaybackSpeed', params),
    ),
  );

  // Render Commands — these require webview (GPU rendering), keep bridge for now
  // but wrap with fallback error instead of silent timeout
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.render.frame',
      (params: {
        time: number;
        width?: number;
        height?: number;
        format?: 'png' | 'jpeg' | 'webp';
      }) => executeTool('RenderFrame', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.render.clip',
      (params: {
        startTime: number;
        endTime: number;
        format?: 'mp4' | 'webm';
        quality?: 'low' | 'medium' | 'high';
      }) => executeTool('RenderClip', params),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.render.thumbnail',
      (params: { elementId: string; time?: number; width?: number; height?: number }) =>
        executeTool('GetThumbnail', params),
    ),
  );

  // Export Command (delegates to neko.exportVideo which uses ExportService directly)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.export.video', async () => {
      await vscode.commands.executeCommand('neko.exportVideo');
    }),
  );

  // Storyboard Import Command — receives shots from neko-canvas storyboard export
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.cut.importStoryboard',
      async (params: {
        projectName: string;
        shots: Array<{
          id: string;
          shotNumber: number;
          duration: number;
          imageDataUrl?: string;
          dialogue?: string;
          voiceOver?: string;
          soundCue?: string;
          label: string;
        }>;
      }) => {
        const webview = _videoEditorProvider.getActiveWebview();
        if (!webview) {
          void handleError(new Error(vscode.l10n.t('editor.warning.noProjectOpen')), {
            showToUser: true,
            severity: 'warning',
          });
          return;
        }
        webview.postMessage({
          type: 'importStoryboard',
          projectName: params.projectName,
          shots: params.shots,
        });
        vscode.window.showInformationMessage(
          `Importing ${params.shots.length} shots from "${params.projectName}" storyboard…`,
        );
      },
    ),
  );
}
