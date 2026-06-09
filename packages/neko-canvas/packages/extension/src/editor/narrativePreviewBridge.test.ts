import { describe, expect, it, vi } from 'vitest';

const testL10nMessages = vi.hoisted(
  (): Record<string, string> => ({
    'neko.canvas.preview.title': '画布预览',
    'neko.canvas.preview.statusWaitingGraph': '等待画布图数据...',
    'neko.canvas.preview.ariaStage': '画布播放舞台',
    'neko.canvas.preview.ariaStageOverlay': '播放舞台叠层',
    'neko.canvas.preview.ariaPlaybackDetails': '播放详情',
    'neko.canvas.preview.ariaDetails': '播放详情',
    'neko.canvas.preview.ariaControls': '播放控制',
    'neko.canvas.preview.ariaTimeline': '播放时间线',
    'neko.canvas.preview.unitFallback': '单元',
    'neko.canvas.preview.planCanvasPlayback': '画布播放',
    'neko.canvas.preview.info': '信息',
    'neko.canvas.preview.branches': '分支',
    'neko.canvas.preview.diagnostics': '诊断',
    'neko.canvas.preview.noUnitSelected': '未选择播放单元',
    'neko.canvas.preview.close': '关闭',
    'neko.canvas.preview.stageZero': '阶段 0',
    'neko.canvas.preview.previous': '上一个',
    'neko.canvas.preview.previousShort': '上一个',
    'neko.canvas.preview.play': '播放',
    'neko.canvas.preview.pause': '暂停',
    'neko.canvas.preview.next': '下一个',
    'neko.canvas.preview.summaryWaitingPlan': '等待画布播放计划...',
    'neko.canvas.preview.statusLoadedZeroRuntime':
      '已加载修订 {revision}，包含 0 个叙事运行时节点。',
    'neko.canvas.preview.statusLoadedRuntime': '已加载修订 {revision}，包含 {count} 个运行时节点。',
    'neko.canvas.preview.statusLoadedPlaybackPlan':
      '已加载画布播放计划（{adapterId}, {behaviorMode}），包含 {count} 个单元{kindList}。',
    'neko.canvas.preview.statusDiagnostics': ' 诊断：{diagnostics}',
    'neko.canvas.preview.statusJumpRequest': '跳转请求：{nodeId}，修订 {revision}。',
    'neko.canvas.preview.stagePosition': '阶段 {index} / {total}',
    'neko.canvas.preview.noPlayableUnit': '没有可播放单元',
    'neko.canvas.preview.noPlayableUnitDescription': '当前画布预览面没有生成可播放单元。',
    'neko.canvas.preview.mediaUnavailable': '媒体不可用',
    'neko.canvas.preview.mediaUnavailableDescription':
      '存在稳定的媒体引用，但当前播放器壳层还没有可用的运行时预览 URL。',
    'neko.canvas.preview.mediaLoading': '正在加载媒体流...',
    'neko.canvas.preview.mediaPreparing': '正在准备媒体流...',
    'neko.canvas.preview.storyboardShot': '分镜镜头',
    'neko.canvas.preview.storyboardShotUnavailableDescription':
      '该镜头还没有生成图片或安全的预览来源。',
    'neko.canvas.preview.storyboardScene': '分镜场景',
    'neko.canvas.preview.storyboardSceneDescription': '场景播放由有序镜头或场景元数据表示。',
    'neko.canvas.preview.canvasNode': '画布节点',
    'neko.canvas.preview.canvasNodeDescription': '该单元以画布摘要展示，并会在源编辑器中高亮。',
    'neko.canvas.preview.playbackPreviewAlt': '播放预览',
    'neko.canvas.preview.labelMode': '模式',
    'neko.canvas.preview.labelDuration': '时长',
    'neko.canvas.preview.labelAsset': '素材',
    'neko.canvas.preview.labelShot': '镜头',
    'neko.canvas.preview.labelScale': '景别',
    'neko.canvas.preview.labelAction': '动作',
    'neko.canvas.preview.labelDialogue': '对白',
    'neko.canvas.preview.labelScene': '场景',
    'neko.canvas.preview.labelLocation': '地点',
    'neko.canvas.preview.labelTime': '时间',
    'neko.canvas.preview.labelMedia': '媒体',
    'neko.canvas.preview.labelMime': 'MIME',
    'neko.canvas.preview.labelSourceNode': '源节点',
    'neko.canvas.preview.labelRenderMode': '渲染模式',
    'neko.canvas.preview.labelResource': '资源',
    'neko.canvas.preview.labelCamera': '镜头运动',
    'neko.canvas.preview.labelAngle': '机位角度',
    'neko.canvas.preview.labelVoice': '旁白',
    'neko.canvas.preview.labelSound': '声音',
    'neko.canvas.preview.labelStatus': '状态',
    'neko.canvas.preview.labelCharacters': '角色',
    'neko.canvas.preview.labelMediaRefs': '媒体引用',
    'neko.canvas.preview.labelPreviewSource': '预览来源',
    'neko.canvas.preview.previewSourceGeneratedImage': '生成图片',
    'neko.canvas.preview.previewSourceGeneratedMedia': '生成媒体',
    'neko.canvas.preview.previewSourceReferenceImage': '引用图片',
    'neko.canvas.preview.previewSourceSourceMedia': '来源媒体',
    'neko.canvas.preview.previewSourceMediaAsset': '媒体素材',
    'neko.canvas.preview.labelImageAsset': '图片素材',
    'neko.canvas.preview.labelVideoAsset': '视频素材',
    'neko.canvas.preview.labelScript': '剧本',
    'neko.canvas.preview.labelMediaType': '媒体类型',
    'neko.canvas.preview.labelAssetPath': '素材路径',
    'neko.canvas.preview.labelDocument': '文档',
    'neko.canvas.preview.labelProject': '项目',
    'neko.canvas.preview.labelScenes': '场景',
    'neko.canvas.preview.noBranches': '没有分支',
    'neko.canvas.preview.noDiagnostics': '没有诊断',
    'neko.canvas.preview.planStoryboardPreview': '分镜预览',
    'neko.canvas.preview.planMediaSequencePreview': '媒体序列预览',
    'neko.canvas.preview.planNarrativePlaybackPlan': '叙事播放计划',
    'neko.canvas.preview.shotTitle': '镜头 {shotNumber}',
    'neko.canvas.preview.fallbackUnitTitle': '{kind} {index}',
    'neko.canvas.preview.bodyShotFallback': '分镜镜头播放单元。',
    'neko.canvas.preview.bodySceneFallback': '分镜场景播放单元。',
    'neko.canvas.preview.bodyMediaSource': '媒体来源：{source}',
    'neko.canvas.preview.bodyMediaFallback': '媒体播放单元。运行时来源会由宿主解析。',
    'neko.canvas.preview.bodyNarrativeFallback': '叙事运行时单元。',
    'neko.canvas.preview.bodyContainerFallback': '容器播放单元。',
    'neko.canvas.preview.bodyGenericFallback': '通用画布节点播放单元。',
    'neko.canvas.preview.choiceContinueTo': '继续到 {title}',
    'neko.canvas.preview.choiceContinue': '继续',
    'neko.canvas.preview.choiceTransition': '{label} -> {targetUnitId}',
    'neko.canvas.preview.itemCountOne': '{count} 项',
    'neko.canvas.preview.itemCountMany': '{count} 项',
    'neko.canvas.preview.durationSeconds': '{seconds} 秒',
    'neko.canvas.preview.kindNode': '节点',
    'neko.canvas.preview.kindContainer': '容器',
    'neko.canvas.preview.kindMedia': '媒体',
    'neko.canvas.preview.kindShot': '镜头',
    'neko.canvas.preview.kindScene': '场景',
    'neko.canvas.preview.kindNarrative': '叙事',
    'neko.canvas.preview.kindUnit': '单元',
    'neko.canvas.preview.disabledByConfiguration': '画布预览已被配置禁用。',
    'neko.canvas.preview.noActiveGraph': '当前没有可用的画布叙事图。',
  }),
);

vi.mock('vscode', () => ({
  ViewColumn: { Beside: 2 },
  Uri: {
    joinPath: vi.fn((base: { path?: string; toString?: () => string }, ...segments: string[]) => ({
      path: `${base.path ?? base.toString?.() ?? ''}/${segments.join('/')}`,
      toString: () => `${base.path ?? base.toString?.() ?? ''}/${segments.join('/')}`,
    })),
    parse: vi.fn((value: string) => ({
      scheme: value.split(':')[0],
      path: value,
      fsPath: value.replace(/^file:\/\//, ''),
      toString: () => value,
    })),
    file: vi.fn((value: string) => ({
      scheme: 'file',
      path: value,
      fsPath: value,
      toString: () => `file://${value}`,
    })),
  },
  env: {
    language: 'zh-cn',
  },
  l10n: {
    t: vi.fn((key: string) => testL10nMessages[key] ?? key),
  },
  window: {
    createWebviewPanel: vi.fn(),
  },
}));

import {
  createCanvasPlaybackPlanFromCanvasData,
  createNarrativeGraphSnapshotFromCanvasData,
  NarrativePreviewBridge,
  parsePreviewToCanvasMessage,
  type NarrativePreviewPanelFactory,
} from './narrativePreviewBridge';
import type {
  CanvasData,
  CanvasPlaybackPlan,
  NarrativeGraphSnapshot,
  PreviewToCanvasMessage,
} from '@neko/shared';

describe('createNarrativeGraphSnapshotFromCanvasData', () => {
  it('extracts runtime nodes, edges, metadata, variables, scene refs, and character bindings', () => {
    const canvas = createCanvasData();
    const snapshot = createNarrativeGraphSnapshotFromCanvasData(canvas, {
      revision: 7,
      sourceCanvasUri: 'file:///story/branch.nkc',
    });

    expect(snapshot.revision).toBe(7);
    expect(snapshot.sourceCanvasUri).toBe('file:///story/branch.nkc');
    expect(snapshot.metadata).toEqual({
      entryNodeId: 'start',
      genre: 'visual-novel',
      defaultLocale: 'zh-cn',
      variables: [{ id: 'affection', name: 'Affection', value: 2 }],
    });
    expect(snapshot.nodes.map((node) => node.nodeId)).toEqual([
      'start',
      'scene-a',
      'choice-a',
      'ending-a',
    ]);
    expect(snapshot.nodes.some((node) => node.nodeId === 'note-a')).toBe(false);
    expect(snapshot.nodes.find((node) => node.nodeId === 'scene-a')?.scene).toMatchObject({
      sceneRef: 'scenes/cafe.fountain',
      backgroundRef: { kind: 'relative-path', path: 'assets/bg/cafe.png' },
      characters: ['characters/hero.yaml'],
      variableEffects: [{ variableId: 'affection', operation: 'add', value: 1 }],
    });
    expect(snapshot.nodes.find((node) => node.nodeId === 'ending-a')?.ending).toEqual({
      endingType: 'good',
      endingLabel: 'Good Ending',
      statisticsSummary: true,
    });
    expect(snapshot.connections).toEqual([
      {
        connectionId: 'c-start-scene',
        sourceNodeId: 'start',
        targetNodeId: 'scene-a',
        type: 'default',
        choiceText: undefined,
        condition: undefined,
        priority: 0,
      },
      {
        connectionId: 'c-scene-choice',
        sourceNodeId: 'scene-a',
        targetNodeId: 'choice-a',
        type: 'choice',
        choiceText: 'Stay',
        condition: 'affection >= 1',
        priority: 2,
      },
      {
        connectionId: 'c-choice-ending',
        sourceNodeId: 'choice-a',
        targetNodeId: 'ending-a',
        type: 'choice',
        choiceText: 'Leave',
        condition: undefined,
        priority: 0,
      },
    ]);
  });
});

describe('NarrativePreviewBridge', () => {
  it('opens, reveals, closes, and reopens a Preview panel without retaining disposed panels', () => {
    const host = createHost(createSnapshot(1));
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 1000,
    });

    expect(bridge.open()).toBe(true);
    expect(panelFactory.createdPanels).toHaveLength(1);
    expect(panelFactory.createdPanels[0]?.title).toBe('画布预览');
    expect(panelFactory.createdPanels[0]?.webview.postMessage).not.toHaveBeenCalled();
    expect(panelFactory.createdPanels[0]?.webview.html).toContain(
      "vscode.postMessage({ type: 'preview:webviewReady'",
    );
    expect(readBootstrapMessages(panelFactory.createdPanels[0]?.webview.html ?? '')).toEqual([
      expect.objectContaining({
        type: 'preview:setFeatureToggles',
        requestId: 'canvas-narrative:toggles:1000:1',
        revision: 1,
        toggles: expect.objectContaining({ preview: true }),
      }),
      expect.objectContaining({
        type: 'preview:loadGraph',
        requestId: 'canvas-narrative:load:1000:2',
        revision: 1,
      }),
    ]);
    panelFactory.createdPanels[0]?.webview.receiveMessage({
      type: 'preview:webviewReady',
      requestId: 'ready-open',
    });

    expect(bridge.open()).toBe(true);
    expect(panelFactory.createdPanels).toHaveLength(1);
    expect(panelFactory.createdPanels[0]?.reveal).toHaveBeenCalledTimes(1);
    expect(panelFactory.createdPanels[0]?.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:loadGraph',
        requestId: 'canvas-narrative:load:1000:4',
        revision: 1,
      }),
    );

    panelFactory.createdPanels[0]?.dispose();
    expect(bridge.open()).toBe(true);
    expect(panelFactory.createdPanels).toHaveLength(2);

    bridge.dispose();
    expect(panelFactory.createdPanels[1]?.dispose).toHaveBeenCalledTimes(1);
  });

  it('posts Canvas playback plan messages alongside narrative graph messages', async () => {
    const plan = createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData());
    const host = createHost(createSnapshot(4), () => plan);
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 3000,
    });

    expect(bridge.open()).toBe(true);
    const bootstrapMessages = readBootstrapMessages(
      panelFactory.createdPanels[0]?.webview.html ?? '',
    );
    expect(bootstrapMessages).toEqual([
      expect.objectContaining({ type: 'preview:setFeatureToggles', revision: 4 }),
      expect.objectContaining({
        type: 'preview:loadGraph',
        requestId: 'canvas-narrative:load:3000:2',
        revision: 4,
      }),
      expect.objectContaining({
        type: 'preview:loadPlaybackPlan',
        requestId: 'canvas-narrative:load-plan-fallback:3000:3',
        revision: 4,
      }),
    ]);
    await waitForMicrotasks();
    expect(panelFactory.createdPanels[0]?.webview.postMessage).not.toHaveBeenCalled();
    panelFactory.createdPanels[0]?.webview.receiveMessage({
      type: 'preview:webviewReady',
      requestId: 'ready-plan',
    });
    expect(panelFactory.createdPanels[0]?.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:loadPlaybackPlan',
        requestId: 'canvas-narrative:load-plan:3000:4',
        revision: 4,
        plan: expect.objectContaining({
          adapterId: 'storyboard',
          units: expect.arrayContaining([
            expect.objectContaining({
              id: 'shot-a1',
              kind: 'shot',
              durationMs: 2000,
              metadata: expect.objectContaining({ visualDescription: 'Opening' }),
            }),
          ]),
        }),
      }),
    );

    expect(bridge.refresh()).toBe(true);
    await waitForMicrotasks();
    expect(panelFactory.createdPanels[0]?.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:refreshPlaybackPlan',
        requestId: 'canvas-narrative:refresh-plan:3000:7',
        revision: 4,
      }),
    );
  });

  it('embeds initial preview messages into first-open HTML before Webview readiness', async () => {
    const plan = createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData());
    const host = createHost(createSnapshot(6), () => plan);
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 3200,
    });

    expect(bridge.open()).toBe(true);
    const panel = panelFactory.createdPanels[0];
    expect(panel?.webview.postMessage).not.toHaveBeenCalled();
    expect(readBootstrapMessages(panel?.webview.html ?? '')).toEqual([
      expect.objectContaining({ type: 'preview:setFeatureToggles', revision: 6 }),
      expect.objectContaining({ type: 'preview:loadGraph', revision: 6 }),
      expect.objectContaining({ type: 'preview:loadPlaybackPlan', revision: 6 }),
    ]);

    await waitForMicrotasks();
    expect(panel?.webview.postMessage).not.toHaveBeenCalled();
    panel?.webview.receiveMessage({
      type: 'preview:webviewReady',
      requestId: 'ready',
    });
    expect(panel?.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'preview:loadPlaybackPlan', revision: 6 }),
    );
  });

  it('resolves Preview-specific playback plans against the Preview webview', async () => {
    const basePlan = createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData());
    const previewPlan: CanvasPlaybackPlan = {
      ...basePlan,
      units: basePlan.units.map((unit) =>
        unit.id === 'shot-a1'
          ? {
              ...unit,
              metadata: {
                ...(unit.metadata ?? {}),
                previewUrl: 'vscode-webview://preview/shot-a1.png',
              },
            }
          : unit,
      ),
    };
    const host = createHost(
      createSnapshot(7),
      () => basePlan,
      vi.fn(async () => previewPlan),
    );
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 3300,
    });

    expect(bridge.open()).toBe(true);
    await waitForMicrotasks();
    const panel = panelFactory.createdPanels[0];
    panel?.webview.receiveMessage({
      type: 'preview:webviewReady',
      requestId: 'ready-preview-plan',
    });

    expect(host.extractCanvasPlaybackPlanForPreview).toHaveBeenCalledWith(
      panel?.webview,
      'file:///story/branch.nkc',
    );
    expect(panel?.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:loadPlaybackPlan',
        plan: expect.objectContaining({
          units: expect.arrayContaining([
            expect.objectContaining({
              id: 'shot-a1',
              metadata: expect.objectContaining({
                previewUrl: 'vscode-webview://preview/shot-a1.png',
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it('renders the Canvas playback preview shell instead of a status-only placeholder', () => {
    const host = createHost(createSnapshot(4), () =>
      createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
    );
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      getMediaRuntimeScriptUri: () =>
        ({
          toString: () =>
            'file:///extension/dist/webview/assets/narrative-preview-media-runtime.js',
        }) as never,
      now: () => 3100,
    });

    expect(bridge.open()).toBe(true);
    const html = panelFactory.createdPanels[0]?.webview.html ?? '';

    expect(html).toContain('id="playback-preview"');
    expect(html).toContain('lang="zh-cn" data-vscode-locale="zh-cn"');
    expect(html).toContain('<title>画布预览</title>');
    expect(html).toContain('const I18N = ');
    expect(html).toContain('等待画布图数据...');
    expect(html).toContain('aria-label="画布播放舞台"');
    expect(html).toContain('id="player-stage"');
    expect(html).toContain('id="stage-content"');
    expect(html).toContain('id="stage-visual"');
    expect(html).toContain('id="player-controls"');
    expect(html).toContain('narrative-preview-media-runtime.js');
    expect(html).toContain('id="segmented-timeline"');
    expect(html).toContain('class="branch-choices"');
    expect(html).toContain('id="playback-clock"');
    expect(html).toContain('id="playback-inspector"');
    expect(html).toContain('id="unit-branch-meta"');
    expect(html).toContain('id="unit-meta"');
    expect(html).not.toContain('id="unit-timeline"');
    expect(html).not.toContain('id="stage-progress"');
    expect(html).not.toContain('class="unit-panel"');
    expect(html).not.toContain('class="playback-toolbar"');
    expect(html).toContain('formatUnitBody');
    expect(html).toContain('formatClockTime');
    expect(html).toContain('renderStageContent');
    expect(html).toContain('renderSegmentedTimeline');
    expect(html).toContain('toggleInspector');
    expect(html).toContain('img-src vscode-webview: data: blob: https:');
    expect(html).toContain('media-src vscode-webview: data: blob: https:');
    expect(html).toContain('__nekoNarrativePreviewMediaRuntime');
    expect(html).not.toContain("document.createElement('video')");
    expect(html).not.toContain("document.createElement('audio')");
    expect(html).toContain('canvas:highlightNode');
    expect(html).toContain("vscode.postMessage({ type: 'preview:webviewReady'");
    expect(readPreviewI18n(html)).toMatchObject({
      title: '画布预览',
      planStoryboardPreview: '分镜预览',
      play: '播放',
      diagnostics: '诊断',
    });
    expect(html).not.toContain('Storyboard Preview');
  });

  it('keeps Canvas playback decisions in the player shell without mutating persisted data', () => {
    const host = createHost(createSnapshot(4), () =>
      createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
    );
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 3150,
    });

    expect(bridge.open()).toBe(true);
    const html = panelFactory.createdPanels[0]?.webview.html ?? '';

    expect(html).toContain("playbackPlan.advancePolicy !== 'media-ended'");
    expect(html).toContain("playbackPlan.behaviorMode === 'interactive' && transitions.length > 1");
    expect(html).toContain('segment.addEventListener');
    expect(html).toContain('setActiveUnit(unit.id, false, 0)');
    expect(html).toContain('unitChoices.appendChild(button)');
    expect(html).toContain('canvas:choiceMade');
    expect(html).toContain("playbackInspector.dataset.open = 'true'");
    expect(html).toContain("playbackInspector.dataset.open = 'false'");
    expect(html).toContain('inspectorDiagnostics.disabled = diagnostics.length === 0');
    expect(html).toContain('mediaUnavailableDescription');
    expect(html).toContain('存在稳定的媒体引用');
    expect(html).toContain('isSafePreviewSource');
    expect(html).not.toContain('node.data.currentTime');
    expect(html).not.toContain('node.data.route');
    expect(html).not.toContain('savePlaybackState');
  });

  it('routes Preview media playback messages to the host instead of narrative message parsing', () => {
    const host = createHost(createSnapshot(9), () =>
      createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
    );
    const mediaHandler = vi.fn();
    const disposeMediaPanel = vi.fn();
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(
      {
        ...host,
        handleNarrativePreviewMediaMessage: mediaHandler,
        disposeNarrativePreviewMediaPanel: disposeMediaPanel,
      },
      {
        panelFactory,
        now: () => 9100,
      },
    );

    expect(bridge.open()).toBe(true);
    const panel = panelFactory.createdPanels[0];
    panel?.webview.receiveMessage({
      type: 'media:probe',
      nodeId: 'preview-media:shot-a1',
      assetPath: 'media/clip.mov',
      mediaType: 'video',
    });

    expect(mediaHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'media:probe',
        nodeId: 'preview-media:shot-a1',
      }),
      panel,
      'file:///story/branch.nkc',
    );
    expect(host.postNarrativePreviewCanvasMessage).not.toHaveBeenCalled();

    panel?.dispose();
    expect(disposeMediaPanel).toHaveBeenCalledWith(panel);
  });

  it('keeps storyboard Canvas playback available when narrative snapshot has zero runtime nodes', () => {
    const canvas = createStoryboardCanvasData();
    const snapshot = createNarrativeGraphSnapshotFromCanvasData(canvas, { revision: 5 });
    const plan = createCanvasPlaybackPlanFromCanvasData(canvas);

    expect(snapshot.nodes).toHaveLength(0);
    expect(plan).toMatchObject({
      adapterId: 'storyboard',
      behaviorMode: 'linear',
      units: [
        expect.objectContaining({ id: 'shot-a1', kind: 'shot' }),
        expect.objectContaining({ id: 'shot-a2', kind: 'shot' }),
      ],
    });
    expect(plan?.diagnostics.some((item) => item.code === 'playback-narrative-runtime-only')).toBe(
      false,
    );
  });

  it('creates Canvas playback plans when snapshots omit the connections array', () => {
    const canvas = createStoryboardCanvasData();
    const { connections: _connections, ...withoutConnections } = canvas;

    const plan = createCanvasPlaybackPlanFromCanvasData(withoutConnections);

    expect(plan).toMatchObject({
      adapterId: 'storyboard',
      units: [
        expect.objectContaining({ id: 'shot-a1', kind: 'shot' }),
        expect.objectContaining({ id: 'shot-a2', kind: 'shot' }),
      ],
    });
  });

  it('drops stale Preview-to-Canvas messages after newer revisions are posted', () => {
    let revision = 2;
    const host = createHost(() => createSnapshot(revision));
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 2000,
    });

    bridge.open();
    panelFactory.createdPanels[0]?.webview.receiveMessage({
      type: 'preview:webviewReady',
      requestId: 'ready-stale-test',
    });
    revision = 3;
    expect(bridge.refresh()).toBe(true);
    expect(bridge.jumpTo('scene-a')).toBe(true);
    expect(bridge.setVariables({ affection: 4 })).toBe(true);
    expect(panelFactory.createdPanels[0]?.webview.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'preview:setVariables',
        requestId: 'canvas-narrative:variables:2000:8',
        revision: 3,
        variables: { affection: 4 },
      }),
    );

    expect(
      bridge.handlePreviewMessage({
        type: 'canvas:highlightNode',
        requestId: 'old',
        nodeId: 'scene-a',
        revision: 2,
      } as PreviewToCanvasMessage),
    ).toBe(false);
    expect(host.postNarrativePreviewCanvasMessage).not.toHaveBeenCalled();

    expect(
      bridge.handlePreviewMessage({
        type: 'canvas:highlightNode',
        requestId: 'current',
        nodeId: 'scene-a',
        revision: 3,
      } as PreviewToCanvasMessage),
    ).toBe(true);
    expect(host.postNarrativePreviewCanvasMessage).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'scene-a' }),
    );
  });

  it('hard gates panel creation when Narrative Preview is disabled', () => {
    const host = createHost(createSnapshot(1));
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      getFeatureToggles: () => ({
        preview: false,
        typewriterEffect: true,
        autoExpressionMatch: true,
        showLockedChoices: true,
        previewAutoSync: true,
        live2dPerformance: false,
      }),
    });

    expect(bridge.open()).toBe(false);
    expect(panelFactory.createdPanels).toHaveLength(0);
    expect(host.extractNarrativeGraphSnapshot).not.toHaveBeenCalled();
  });

  it('parses typed Preview-to-Canvas messages and rejects malformed payloads', () => {
    expect(
      parsePreviewToCanvasMessage({
        type: 'canvas:choiceMade',
        requestId: 'choice-1',
        fromNodeId: 'choice-a',
        toNodeId: 'ending-a',
      }),
    ).toEqual({
      type: 'canvas:choiceMade',
      requestId: 'choice-1',
      fromNodeId: 'choice-a',
      toNodeId: 'ending-a',
    });
    expect(parsePreviewToCanvasMessage({ type: 'canvas:highlightNode' })).toBeUndefined();
    expect(
      parsePreviewToCanvasMessage({ type: 'preview:loadGraph', requestId: 'x' }),
    ).toBeUndefined();
  });
});

function createCanvasData(): CanvasData {
  return {
    version: '2.1',
    name: 'Branching Story',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    narrative: {
      entryNodeId: 'start',
      genre: 'visual-novel',
      defaultLocale: 'zh-cn',
      variables: [{ id: 'affection', name: 'Affection', value: 2 }],
    },
    nodes: [
      createNode('start', 'narrative-start', { label: 'Start' }),
      createNode('scene-a', 'narrative-scene', {
        title: 'Cafe',
        sceneRef: 'scenes/cafe.fountain',
        backgroundRef: 'assets/bg/cafe.png',
        characters: ['characters/hero.yaml'],
        variableEffects: [{ variableId: 'affection', operation: 'add', value: 1 }],
      }),
      createNode('choice-a', 'choice', { label: 'Choice' }),
      createNode('ending-a', 'narrative-ending', {
        endingType: 'good',
        endingLabel: 'Good Ending',
        statisticsSummary: true,
      }),
      createNode('note-a', 'narrative-note', { content: 'Editor only' }),
    ],
    connections: [
      createConnection('c-start-scene', 'start', 'scene-a', 'default'),
      createConnection('c-scene-choice', 'scene-a', 'choice-a', 'choice', {
        choiceText: 'Stay',
        condition: 'affection >= 1',
        priority: 2,
      }),
      createConnection('c-choice-ending', 'choice-a', 'ending-a', 'choice', {
        label: 'Leave',
      }),
      createConnection('c-note-scene', 'note-a', 'scene-a', 'default'),
    ],
  };
}

function createNode(
  id: string,
  type: CanvasData['nodes'][number]['type'],
  data: Record<string, unknown>,
): CanvasData['nodes'][number] {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: 1,
    data,
  } as CanvasData['nodes'][number];
}

function createConnection(
  id: string,
  sourceId: string,
  targetId: string,
  type: CanvasData['connections'][number]['type'],
  extra: Partial<CanvasData['connections'][number]> = {},
): CanvasData['connections'][number] {
  return {
    id,
    sourceId,
    sourceAnchor: 'right',
    targetId,
    targetAnchor: 'left',
    type,
    ...extra,
  };
}

function createSnapshot(revision: number): NarrativeGraphSnapshot {
  return createNarrativeGraphSnapshotFromCanvasData(createCanvasData(), {
    revision,
    sourceCanvasUri: 'file:///story/branch.nkc',
  });
}

function createHost(
  snapshot: NarrativeGraphSnapshot | (() => NarrativeGraphSnapshot),
  plan?:
    | CanvasPlaybackPlan
    | ((sourceCanvasUri?: string) => CanvasPlaybackPlan | undefined)
    | undefined,
  previewPlan?: (
    webview: unknown,
    sourceCanvasUri?: string,
  ) => CanvasPlaybackPlan | Promise<CanvasPlaybackPlan | undefined> | undefined,
) {
  return {
    extractNarrativeGraphSnapshot: vi.fn(() =>
      typeof snapshot === 'function' ? snapshot() : snapshot,
    ),
    extractCanvasPlaybackPlan: vi.fn((sourceCanvasUri?: string) =>
      typeof plan === 'function' ? plan(sourceCanvasUri) : plan,
    ),
    ...(previewPlan ? { extractCanvasPlaybackPlanForPreview: previewPlan } : {}),
    postNarrativePreviewCanvasMessage: vi.fn(() => true),
  };
}

async function waitForMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createStoryboardCanvasData(): CanvasData {
  return {
    version: '2.1',
    name: 'Scene Only',
    nodes: [
      {
        id: 'scene-a',
        type: 'scene',
        position: { x: 0, y: 0 },
        size: { width: 480, height: 280 },
        zIndex: 0,
        container: {
          policy: 'scene',
          childIds: ['shot-a1', 'shot-a2'],
          layout: { mode: 'sequence' },
        },
        data: { sceneTitle: 'Scene A', sceneNumber: 1 },
      },
      createNode('shot-a1', 'shot', {
        shotNumber: 1,
        duration: 2,
        visualDescription: 'Opening',
        characters: [{ characterName: 'Hero' }],
        shotScale: 'MS',
        characterAction: 'Looks around',
        emotion: [],
        sceneTags: [],
        generationStatus: 'idle',
        generationHistory: [],
      }),
      createNode('shot-a2', 'shot', {
        shotNumber: 2,
        duration: 3,
        visualDescription: 'Close up',
        characters: [],
        shotScale: 'CU',
        characterAction: 'Speaks',
        emotion: [],
        sceneTags: [],
        generationStatus: 'idle',
        generationHistory: [],
      }),
    ].map((node) =>
      node.id === 'shot-a1' || node.id === 'shot-a2' ? { ...node, parentId: 'scene-a' } : node,
    ) as CanvasData['nodes'],
    connections: [],
  };
}

function createPanelFactory(): NarrativePreviewPanelFactory & {
  readonly createdPanels: ReturnType<typeof createPanel>[];
} {
  const createdPanels: ReturnType<typeof createPanel>[] = [];
  return {
    createdPanels,
    createWebviewPanel: vi.fn((_viewType, title) => {
      const panel = createPanel(title);
      createdPanels.push(panel);
      return panel as never;
    }),
  };
}

function createPanel(title: string) {
  const disposeHandlers: Array<() => void> = [];
  let messageHandler: ((message: unknown) => void) | undefined;
  const panel = {
    title,
    webview: {
      html: '',
      cspSource: 'vscode-webview:',
      asWebviewUri: vi.fn((uri: { toString?: () => string; path?: string }) => ({
        toString: () => `vscode-webview-resource://${uri.path ?? uri.toString?.() ?? ''}`,
      })),
      postMessage: vi.fn(() => Promise.resolve(true)),
      onDidReceiveMessage: vi.fn((handler: (message: unknown) => void) => {
        messageHandler = handler;
        return { dispose: vi.fn() };
      }),
      receiveMessage: (message: unknown) => messageHandler?.(message),
    },
    reveal: vi.fn(),
    dispose: vi.fn(() => {
      for (const handler of disposeHandlers) {
        handler();
      }
    }),
    onDidDispose: vi.fn((handler: () => void) => {
      disposeHandlers.push(handler);
      return { dispose: vi.fn() };
    }),
  };
  return panel;
}

function readBootstrapMessages(html: string): unknown[] {
  const match = html.match(/const BOOTSTRAP_MESSAGES = (.*?);/);
  if (!match?.[1]) {
    return [];
  }
  return JSON.parse(match[1]) as unknown[];
}

function readPreviewI18n(html: string): Record<string, string> {
  const match = html.match(/const I18N = (.*?);/);
  if (!match?.[1]) {
    return {};
  }
  return JSON.parse(match[1]) as Record<string, string>;
}
