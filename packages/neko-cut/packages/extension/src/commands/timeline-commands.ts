/**
 * Timeline Commands
 * VSCode commands for timeline operations
 */

import * as vscode from 'vscode';
import type { VideoEditorProvider } from '../editor/video/videoEditorProvider';
import type { TimelineToolResult } from '../bootstrap/toolsBootstrap';
import { getTimelineBridge } from '../bootstrap/toolsBootstrap';

/**
 * Register timeline-related VSCode commands
 */
export function registerTimelineCommands(
  context: vscode.ExtensionContext,
  videoEditorProvider: VideoEditorProvider
): void {
  const bridge = getTimelineBridge();

  /**
   * Execute a timeline bridge action with the active webview.
   * Handles webview acquisition, null-guard with user warning, and bridge setup.
   *
   * @param toolName - The timeline tool action name to execute
   * @param params - Parameters to pass to the tool
   * @returns The tool execution result, or undefined if no webview is available
   */
  async function withActiveWebview<T = unknown>(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<TimelineToolResult<T> | undefined> {
    const webview = videoEditorProvider.getActiveWebview();
    if (!webview) {
      vscode.window.showWarningMessage('No video project is open.');
      return;
    }
    bridge.setWebview(webview);
    return bridge.execute<T>(toolName, params);
  }

  // Timeline Info Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.timeline.getInfo', () =>
      withActiveWebview('GetTimelineInfo', {})
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.timeline.listElements', (trackType?: string) =>
      withActiveWebview('ListElements', { trackType })
    )
  );

  // Element Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.element.add', (params: {
      type: string;
      trackId?: string;
      startTime?: number;
      duration?: number;
      properties?: Record<string, unknown>;
    }) =>
      withActiveWebview('AddElement', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.element.update', (params: {
      elementId: string;
      properties: Record<string, unknown>;
    }) =>
      withActiveWebview('UpdateElement', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.element.delete', (elementId: string) =>
      withActiveWebview('DeleteElement', { elementId })
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.element.getInfo', (elementId: string) =>
      withActiveWebview('GetElementInfo', { elementId })
    )
  );

  // Track Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.track.add', (params: {
      type: string;
      name?: string;
      index?: number;
    }) =>
      withActiveWebview('AddTrack', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.track.delete', (trackId: string) =>
      withActiveWebview('DeleteTrack', { trackId })
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.track.reorder', (params: {
      trackId: string;
      newIndex: number;
    }) =>
      withActiveWebview('ReorderTrack', params)
    )
  );

  // Effect Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.effect.list', () =>
      withActiveWebview('ListEffects', {})
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.effect.add', (params: {
      elementId: string;
      effectType: string;
      parameters?: Record<string, unknown>;
    }) =>
      withActiveWebview('AddEffect', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.effect.update', (params: {
      elementId: string;
      effectId: string;
      params: Record<string, unknown>;
    }) =>
      withActiveWebview('UpdateEffect', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.effect.remove', (params: {
      elementId: string;
      effectId: string;
    }) =>
      withActiveWebview('RemoveEffect', params)
    )
  );

  // Transition Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.transition.list', () =>
      withActiveWebview('ListTransitions', {})
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.transition.add', (params: {
      elementId: string;
      transitionType: string;
      duration?: number;
      position?: 'in' | 'out';
    }) =>
      withActiveWebview('SetTransition', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.transition.remove', (params: {
      elementId: string;
      placement: 'in' | 'out';
    }) =>
      withActiveWebview('RemoveTransition', params)
    )
  );

  // Mask Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.mask.add', (params: {
      elementId: string;
      maskType: string;
      params: Record<string, unknown>;
    }) =>
      withActiveWebview('AddMask', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.mask.update', (params: {
      elementId: string;
      maskId: string;
      params: Record<string, unknown>;
    }) =>
      withActiveWebview('UpdateMask', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.mask.remove', (params: {
      elementId: string;
      maskId: string;
    }) =>
      withActiveWebview('RemoveMask', params)
    )
  );

  // Keyframe Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.keyframe.get', (params: {
      elementId: string;
      property?: string;
    }) =>
      withActiveWebview('GetKeyframes', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.keyframe.add', (params: {
      elementId: string;
      property: string;
      time: number;
      value: unknown;
      easing?: string;
    }) =>
      withActiveWebview('AddKeyframe', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.keyframe.update', (params: {
      elementId: string;
      keyframeId: string;
      time?: number;
      value?: unknown;
      easing?: string;
    }) =>
      withActiveWebview('UpdateKeyframe', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.keyframe.remove', (params: {
      elementId: string;
      keyframeId: string;
    }) =>
      withActiveWebview('RemoveKeyframe', params)
    )
  );

  // Shape Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.shape.add', (params: {
      trackId: string;
      shapeType: string;
      name?: string;
      position?: { x?: number; y?: number };
      size?: { width?: number; height?: number };
      style?: Record<string, unknown>;
      transform?: Record<string, unknown>;
    }) =>
      withActiveWebview('AddShape', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.shape.update', (params: {
      shapeId?: string;
      elementId?: string;
      position?: { x?: number; y?: number };
      size?: { width?: number; height?: number };
      style?: Record<string, unknown>;
      visible?: boolean;
      locked?: boolean;
    }) =>
      withActiveWebview('UpdateShape', params)
    )
  );

  // Color Correction Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.color.set', (params: {
      elementId: string;
      brightness?: number;
      contrast?: number;
      saturation?: number;
      temperature?: number;
      tint?: number;
      gamma?: number;
    }) =>
      withActiveWebview('SetColorCorrection', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.color.reset', (elementId: string) =>
      withActiveWebview('ResetColorCorrection', { elementId })
    )
  );

  // Audio Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.audio.setProperties', (params: {
      elementId: string;
      volume?: number;
      pan?: number;
      muted?: boolean;
      fadeIn?: number;
      fadeOut?: number;
    }) =>
      withActiveWebview('SetAudioProperties', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.audio.addKeyframe', (params: {
      elementId: string;
      property: 'volume' | 'pan';
      time: number;
      value: number;
    }) =>
      withActiveWebview('AddAudioKeyframe', params)
    )
  );

  // Track Properties Command
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.track.setProperties', (params: {
      trackId: string;
      name?: string;
      muted?: boolean;
      locked?: boolean;
      solo?: boolean;
    }) =>
      withActiveWebview('SetTrackProperties', params)
    )
  );

  // Media Separate Audio Command
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.media.separateAudio', (params: {
      elementId: string;
      targetTrackId?: string;
    }) =>
      withActiveWebview('SeparateAudio', params)
    )
  );

  // Export Progress Command (uses ExportService directly)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.export.getProgress', async () => {
      const exportService = videoEditorProvider.getActiveExportService();
      if (!exportService) {
        return { success: false, error: 'No export service available' };
      }
      const progress = await exportService.getProgress();
      return { success: true, data: progress };
    })
  );

  // Animation Commands (existing add_animation -> add_keyframe)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.animation.add', (params: {
      elementId: string;
      property: string;
      keyframes: Array<{ time: number; value: unknown; easing?: string }>;
    }) =>
      withActiveWebview('AddAnimation', params)
    )
  );

  // Subtitle Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.subtitle.add', (params: {
      text: string;
      startTime: number;
      endTime: number;
      style?: Record<string, unknown>;
    }) =>
      withActiveWebview('AddSubtitle', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.subtitle.import', (params: {
      format: 'srt' | 'vtt' | 'ass';
      content: string;
    }) =>
      withActiveWebview('ImportSubtitles', params)
    )
  );

  // Media Operation Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.media.trim', (params: {
      elementId: string;
      startTime: number;
      endTime: number;
    }) =>
      withActiveWebview('TrimMedia', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.media.split', (params: {
      elementId: string;
      splitTime: number;
    }) =>
      withActiveWebview('SplitMedia', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.media.setSpeed', (params: {
      elementId: string;
      speed: number;
    }) =>
      withActiveWebview('SetSpeed', params)
    )
  );

  // Render Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.render.frame', (params: {
      time: number;
      width?: number;
      height?: number;
      format?: 'png' | 'jpeg' | 'webp';
    }) =>
      withActiveWebview('RenderFrame', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.render.clip', (params: {
      startTime: number;
      endTime: number;
      format?: 'mp4' | 'webm';
      quality?: 'low' | 'medium' | 'high';
    }) =>
      withActiveWebview('RenderClip', params)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.render.thumbnail', (params: {
      elementId: string;
      time?: number;
      width?: number;
      height?: number;
    }) =>
      withActiveWebview('GetThumbnail', params)
    )
  );

  // Export Command (delegates to neko.exportVideo which uses ExportService directly)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.export.video', async () => {
      await vscode.commands.executeCommand('neko.exportVideo');
    })
  );
}
