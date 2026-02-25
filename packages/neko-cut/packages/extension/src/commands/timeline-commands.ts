/**
 * Timeline Commands
 * VSCode commands for timeline operations
 */

import * as vscode from 'vscode';
import type { VideoEditorProvider } from '../editor/video/videoEditorProvider';
import { getTimelineBridge } from '../bootstrap/toolsBootstrap';

/**
 * Register timeline-related VSCode commands
 */
export function registerTimelineCommands(
  context: vscode.ExtensionContext,
  videoEditorProvider: VideoEditorProvider
): void {
  const bridge = getTimelineBridge();

  // Timeline Info Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.timeline.getInfo', async () => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('GetTimelineInfo', {});
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.timeline.listElements', async (trackType?: string) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('ListElements', { trackType });
      return result;
    })
  );

  // Element Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.element.add', async (params: {
      type: string;
      trackId?: string;
      startTime?: number;
      duration?: number;
      properties?: Record<string, unknown>;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('AddElement', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.element.update', async (params: {
      elementId: string;
      properties: Record<string, unknown>;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('UpdateElement', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.element.delete', async (elementId: string) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('DeleteElement', { elementId });
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.element.getInfo', async (elementId: string) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('GetElementInfo', { elementId });
      return result;
    })
  );

  // Track Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.track.add', async (params: {
      type: string;
      name?: string;
      index?: number;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('AddTrack', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.track.delete', async (trackId: string) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('DeleteTrack', { trackId });
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.track.reorder', async (params: {
      trackId: string;
      newIndex: number;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('ReorderTrack', params);
      return result;
    })
  );

  // Effect Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.effect.list', async () => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('ListEffects', {});
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.effect.add', async (params: {
      elementId: string;
      effectType: string;
      parameters?: Record<string, unknown>;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('AddEffect', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.effect.update', async (params: {
      elementId: string;
      effectId: string;
      params: Record<string, unknown>;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('UpdateEffect', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.effect.remove', async (params: {
      elementId: string;
      effectId: string;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('RemoveEffect', params);
      return result;
    })
  );

  // Transition Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.transition.list', async () => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('ListTransitions', {});
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.transition.add', async (params: {
      elementId: string;
      transitionType: string;
      duration?: number;
      position?: 'in' | 'out';
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('SetTransition', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.transition.remove', async (params: {
      elementId: string;
      placement: 'in' | 'out';
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('RemoveTransition', params);
      return result;
    })
  );

  // Mask Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.mask.add', async (params: {
      elementId: string;
      maskType: string;
      params: Record<string, unknown>;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('AddMask', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.mask.update', async (params: {
      elementId: string;
      maskId: string;
      params: Record<string, unknown>;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('UpdateMask', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.mask.remove', async (params: {
      elementId: string;
      maskId: string;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('RemoveMask', params);
      return result;
    })
  );

  // Keyframe Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.keyframe.get', async (params: {
      elementId: string;
      property?: string;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('GetKeyframes', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.keyframe.add', async (params: {
      elementId: string;
      property: string;
      time: number;
      value: unknown;
      easing?: string;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('AddKeyframe', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.keyframe.update', async (params: {
      elementId: string;
      keyframeId: string;
      time?: number;
      value?: unknown;
      easing?: string;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('UpdateKeyframe', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.keyframe.remove', async (params: {
      elementId: string;
      keyframeId: string;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('RemoveKeyframe', params);
      return result;
    })
  );

  // Shape Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.shape.add', async (params: {
      trackId: string;
      shapeType: string;
      name?: string;
      position?: { x?: number; y?: number };
      size?: { width?: number; height?: number };
      style?: Record<string, unknown>;
      transform?: Record<string, unknown>;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('AddShape', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.shape.update', async (params: {
      shapeId?: string;
      elementId?: string;
      position?: { x?: number; y?: number };
      size?: { width?: number; height?: number };
      style?: Record<string, unknown>;
      visible?: boolean;
      locked?: boolean;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('UpdateShape', params);
      return result;
    })
  );

  // Color Correction Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.color.set', async (params: {
      elementId: string;
      brightness?: number;
      contrast?: number;
      saturation?: number;
      temperature?: number;
      tint?: number;
      gamma?: number;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('SetColorCorrection', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.color.reset', async (elementId: string) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('ResetColorCorrection', { elementId });
      return result;
    })
  );

  // Audio Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.audio.setProperties', async (params: {
      elementId: string;
      volume?: number;
      pan?: number;
      muted?: boolean;
      fadeIn?: number;
      fadeOut?: number;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('SetAudioProperties', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.audio.addKeyframe', async (params: {
      elementId: string;
      property: 'volume' | 'pan';
      time: number;
      value: number;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('AddAudioKeyframe', params);
      return result;
    })
  );

  // Track Properties Command
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.track.setProperties', async (params: {
      trackId: string;
      name?: string;
      muted?: boolean;
      locked?: boolean;
      solo?: boolean;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('SetTrackProperties', params);
      return result;
    })
  );

  // Media Separate Audio Command
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.media.separateAudio', async (params: {
      elementId: string;
      targetTrackId?: string;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('SeparateAudio', params);
      return result;
    })
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
    vscode.commands.registerCommand('neko.animation.add', async (params: {
      elementId: string;
      property: string;
      keyframes: Array<{ time: number; value: unknown; easing?: string }>;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('AddAnimation', params);
      return result;
    })
  );

  // Subtitle Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.subtitle.add', async (params: {
      text: string;
      startTime: number;
      endTime: number;
      style?: Record<string, unknown>;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('AddSubtitle', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.subtitle.import', async (params: {
      format: 'srt' | 'vtt' | 'ass';
      content: string;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('ImportSubtitles', params);
      return result;
    })
  );

  // Media Operation Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.media.trim', async (params: {
      elementId: string;
      startTime: number;
      endTime: number;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('TrimMedia', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.media.split', async (params: {
      elementId: string;
      splitTime: number;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('SplitMedia', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.media.setSpeed', async (params: {
      elementId: string;
      speed: number;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('SetSpeed', params);
      return result;
    })
  );

  // Render Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.render.frame', async (params: {
      time: number;
      width?: number;
      height?: number;
      format?: 'png' | 'jpeg' | 'webp';
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('RenderFrame', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.render.clip', async (params: {
      startTime: number;
      endTime: number;
      format?: 'mp4' | 'webm';
      quality?: 'low' | 'medium' | 'high';
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('RenderClip', params);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.render.thumbnail', async (params: {
      elementId: string;
      time?: number;
      width?: number;
      height?: number;
    }) => {
      const webview = videoEditorProvider.getActiveWebview();
      if (!webview) {
        vscode.window.showWarningMessage('No video project is open.');
        return;
      }
      bridge.setWebview(webview);
      const result = await bridge.execute('GetThumbnail', params);
      return result;
    })
  );

  // Export Command (delegates to neko.exportVideo which uses ExportService directly)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.export.video', async () => {
      await vscode.commands.executeCommand('neko.exportVideo');
    })
  );
}
