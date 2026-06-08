/**
 * Protocol integration tests for neko-story extension.
 *
 * Exercises real production code paths:
 * - TimelineConverter.convert() produces AudioElement for audio assets (NKS-003)
 * - Source contract: FOUNTAIN_GLOB and SEE_LINK_PATTERN cover same extensions
 * - Source contract: PreviewPanel CSP includes img-src
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('vscode', () => ({
  Uri: { file: (p: string) => ({ scheme: 'file', fsPath: p }) },
  EventEmitter: vi.fn(),
  commands: { executeCommand: vi.fn() },
  window: { onDidChangeTextEditorSelection: vi.fn(() => ({ dispose: vi.fn() })) },
}));

import { TimelineConverter } from '../converters/TimelineConverter';
import type { FountainDocument } from '@neko-story/types';

// Read source files for contract verification
const workspaceIndexSource = readFileSync(
  join(__dirname, '../services/WorkspaceIndexService.ts'),
  'utf-8',
);
const documentLinkSource = readFileSync(join(__dirname, '../providers/documentLink.ts'), 'utf-8');
const previewPanelSource = readFileSync(join(__dirname, '../panels/PreviewPanel.ts'), 'utf-8');
const extensionSource = readFileSync(join(__dirname, '../extension.ts'), 'utf-8');
const capabilityProviderSource = readFileSync(
  join(__dirname, '../agentCapabilityProvider.ts'),
  'utf-8',
);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../../../../package.json'), 'utf-8'));

describe('neko-story protocol', () => {
  describe('format support consistency', () => {
    it('FOUNTAIN_GLOB and SEE_LINK_PATTERN cover the same extensions', () => {
      // Extract extensions from FOUNTAIN_GLOB in source
      const globMatch = workspaceIndexSource.match(/FOUNTAIN_GLOB\s*=\s*'\*\*\/\*\.\{([^}]+)\}'/);
      const globExts = globMatch?.[1]?.split(',').sort() ?? [];

      // Extract extensions from SEE_LINK_PATTERN in source
      const regexMatch = documentLinkSource.match(/\(\?:([^)]+)\)/);
      const regexExts = regexMatch?.[1]?.split('|').sort() ?? [];

      expect(globExts).toEqual(regexExts);
      expect(globExts).toEqual(['fountain', 'nks', 'story']);
    });

    it('package.json language extensions match FOUNTAIN_GLOB', () => {
      const languages = packageJson.contributes?.languages;
      expect(languages).toBeDefined();

      const lang = languages?.find(
        (l: { id: string }) => l.id === 'fountain' || l.id === 'nekostory',
      );
      expect(lang).toBeDefined();

      const pkgExts = (lang.extensions as string[]).map((e: string) => e.replace(/^\./, '')).sort();
      expect(pkgExts).toEqual(['fountain', 'nks', 'story']);
    });
  });

  describe('NKS-003: audio asset mapping', () => {
    it('converts audio asset reference to AudioElement (type: audio)', () => {
      const doc: FountainDocument = {
        titlePage: null,
        elements: [
          {
            type: 'scene_heading',
            raw: 'INT. STUDIO',
            text: 'INT. STUDIO',
            sceneNumber: null,
            line: 1,
          },
          {
            type: 'note',
            text: '[[AUDIO: background.mp3]]',
            noteType: 'inline',
            line: 2,
            assetRef: { type: 'audio', path: 'background.mp3' },
          },
        ] as any,
      };

      const converter = new TimelineConverter();
      const result = converter.convert(doc, 'Test Script');

      // Should have a media track with one AudioElement
      const mediaTrack = result.project.tracks.find((t) => t.type === 'media');
      expect(mediaTrack).toBeDefined();
      expect(mediaTrack!.elements).toHaveLength(1);

      const audioEl = mediaTrack!.elements[0]!;
      expect(audioEl.type).toBe('audio');
      expect((audioEl as any).src).toBe('background.mp3');
    });

    it('converts video asset reference to MediaElement with mediaType video', () => {
      const doc: FountainDocument = {
        titlePage: null,
        elements: [
          {
            type: 'scene_heading',
            raw: 'EXT. PARK',
            text: 'EXT. PARK',
            sceneNumber: null,
            line: 1,
          },
          {
            type: 'note',
            text: '[[VIDEO: clip.mp4]]',
            noteType: 'inline',
            line: 2,
            assetRef: { type: 'video', path: 'clip.mp4' },
          },
        ] as any,
      };

      const converter = new TimelineConverter();
      const result = converter.convert(doc, 'Test Script');

      const mediaTrack = result.project.tracks.find((t) => t.type === 'media');
      expect(mediaTrack).toBeDefined();
      const videoEl = mediaTrack!.elements[0]! as any;
      expect(videoEl.type).toBe('media');
      expect(videoEl.mediaType).toBe('video');
    });
  });

  describe('PreviewPanel CSP', () => {
    it('includes img-src directive in Content-Security-Policy', () => {
      expect(previewPanelSource).toContain('img-src');
    });

    it('includes script-src with nonce', () => {
      expect(previewPanelSource).toContain('script-src');
      expect(previewPanelSource).toContain('nonce-');
    });
  });

  describe('storyboard command handoff', () => {
    it('routes generateStoryboard command through scene agent payload', () => {
      expect(extensionSource).toContain("'neko.story.generateStoryboard'");
      expect(extensionSource).toContain('const payload = buildSceneAgentPayload(');
      expect(extensionSource).toContain("'neko.agent.sendContext'");
    });

    it('registers pipeline event write-back command for scene state store', () => {
      expect(extensionSource).toContain("'neko.story.handlePipelineEvent'");
      expect(extensionSource).toContain('sceneStateStore.handlePipelineEvent(');
    });

    it('subscribes to canvas change events for realtime scene-state write-back', () => {
      expect(extensionSource).toContain('subscribeCanvasSceneWriteback(context, sceneStateStore);');
      expect(extensionSource).toContain('sceneStateStore.handleCanvasEvent(event);');
    });

    it('refreshes Canvas Narrative Preview when standard Fountain scenes are saved', () => {
      expect(extensionSource).toContain(
        'subscribeNarrativePreviewFountainRefresh(context, logger);',
      );
      expect(extensionSource).toContain('vscode.workspace.onDidSaveTextDocument');
      expect(extensionSource).toContain('isFountainSceneDocument(document)');
      expect(extensionSource).toContain("'neko.canvas.refreshNarrativePreview'");
      expect(extensionSource).toContain("toLowerCase() === '.fountain'");
      expect(extensionSource).not.toContain("toLowerCase() === '.nks'");
      expect(extensionSource).not.toContain("toLowerCase() === '.story'");
    });

    it('registers a standard video creation command as structured story-table handoff', () => {
      expect(extensionSource).toContain("'neko.story.startVideoCreation'");
      expect(extensionSource).toContain('buildStoryTableAgentPayload({');
      expect(extensionSource).toContain("workflowIntent: 'full-video-creation'");
      expect(extensionSource).toContain("'neko.agent.sendContext'");
      expect(extensionSource).toContain('sceneIds: targetSceneIds');
    });

    it('registers ScenePlan and ShotPlan agent tools in story capability provider', () => {
      expect(capabilityProviderSource).toContain('TOOL_NAMES_STORY.GENERATE_SCENE_PLAN');
      expect(capabilityProviderSource).toContain('TOOL_NAMES_STORY.GENERATE_SHOT_PLAN');
      expect(capabilityProviderSource).toContain('buildStoryScenePlans(index');
      expect(capabilityProviderSource).toContain('buildShotPlansForScene(scene');
    });
  });

  describe('creative entity management commands', () => {
    const commands = (packageJson.contributes?.commands as Array<{ command: string }>).map(
      (command) => command.command,
    );

    it('declares entity detail, binding, draft, requirement, and package commands', () => {
      expect(commands).toEqual(
        expect.arrayContaining([
          'neko.story.showCreativeEntityDetail',
          'neko.story.setCreativeEntityDefaultBinding',
          'neko.story.reviewVisualDrafts',
          'neko.story.showMissingMaterialQueue',
          'neko.story.showRepresentationPackageDetail',
        ]),
      );
    });

    it('registers creative entity command handlers during activation', () => {
      expect(extensionSource).toContain('registerCreativeEntityCommands(context');
      expect(extensionSource).toContain('creativeEntityIndex: creativeEntityIndexService');
      expect(extensionSource).toContain('entityGraph: entityGraphService');
    });
  });
});
