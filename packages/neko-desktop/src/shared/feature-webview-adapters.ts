import { createAudioFeatureWebviewHostAdapters } from '@neko-audio/webview/workbench-adapter';
import { createCanvasFeatureWebviewHostAdapters } from '@neko-canvas/webview/workbench-adapter';
import { createModelFeatureWebviewHostAdapters } from '@neko-model/webview/workbench-adapter';
import { createSketchFeatureWebviewHostAdapters } from '@neko-sketch/webview/workbench-adapter';
import { createPreviewFeatureWebviewHostAdapters } from '@neko/preview-webview/workbench-adapter';
import { createCutFeatureWebviewHostAdapters } from '@neko/webview/workbench-adapter';
import type {
  NekoWorkbenchHostCapability,
  WorkbenchFeatureWebviewAdapterRegistry,
  WorkbenchFeatureWebviewHostAdapterDescriptor,
} from '@neko/workbench-core';
import { createWorkbenchFeatureWebviewAdapterRegistry } from '@neko/workbench-core';
import type {
  DesktopCreativePanelKind,
  DesktopEditorAdapterDescriptor,
  DesktopEditorKind,
} from './contracts';

const FEATURE_EDITOR_ADAPTERS_BY_EXTENSION = createFeatureEditorAdaptersByExtension();
const FEATURE_EDITOR_ADAPTERS_BY_PANEL_KIND = createFeatureEditorAdaptersByPanelKind();

export function createDesktopFeatureWebviewHostAdapters(): readonly WorkbenchFeatureWebviewHostAdapterDescriptor[] {
  return [
    ...createCanvasFeatureWebviewHostAdapters(),
    ...createCutFeatureWebviewHostAdapters(),
    ...createAudioFeatureWebviewHostAdapters(),
    ...createSketchFeatureWebviewHostAdapters(),
    ...createModelFeatureWebviewHostAdapters(),
    ...createPreviewFeatureWebviewHostAdapters(),
  ];
}

export function createDesktopFeatureWebviewAdapterRegistry(
  hostCapabilities: readonly NekoWorkbenchHostCapability[],
): WorkbenchFeatureWebviewAdapterRegistry {
  const registry = createWorkbenchFeatureWebviewAdapterRegistry({
    hostKind: 'electron',
    hostCapabilities,
  });
  registry.registerMany(createDesktopFeatureWebviewHostAdapters());
  return registry;
}

export function createDesktopFeatureEditorAdapterDescriptorForFileName(
  fileName: string,
): DesktopEditorAdapterDescriptor | undefined {
  const extension = readLowercaseExtension(fileName);
  if (!extension) {
    return undefined;
  }
  const adapter = FEATURE_EDITOR_ADAPTERS_BY_EXTENSION.get(extension);
  return adapter ? createDesktopEditorAdapterDescriptor(adapter) : undefined;
}

export function createDesktopFeatureEditorAdapterDescriptorForPanelKind(
  panelKind: DesktopCreativePanelKind,
): DesktopEditorAdapterDescriptor | undefined {
  const adapter = FEATURE_EDITOR_ADAPTERS_BY_PANEL_KIND.get(panelKind);
  return adapter ? createDesktopEditorAdapterDescriptor(adapter) : undefined;
}

export function listDesktopFeatureEditorPanelKinds(): readonly DesktopCreativePanelKind[] {
  return [...FEATURE_EDITOR_ADAPTERS_BY_PANEL_KIND.keys()];
}

function createFeatureEditorAdaptersByExtension(): ReadonlyMap<
  string,
  WorkbenchFeatureWebviewHostAdapterDescriptor
> {
  const adaptersByExtension = new Map<string, WorkbenchFeatureWebviewHostAdapterDescriptor>();
  for (const adapter of createDesktopFeatureWebviewHostAdapters()) {
    for (const selector of adapter.customEditor?.selectors ?? []) {
      if (!selector.extension) {
        continue;
      }
      const extension = selector.extension.toLowerCase();
      const previous = adaptersByExtension.get(extension);
      if (previous) {
        throw new Error(
          `Duplicate Desktop feature editor selector '${extension}' from ${previous.owner.id} and ${adapter.owner.id}.`,
        );
      }
      adaptersByExtension.set(extension, adapter);
    }
  }
  return adaptersByExtension;
}

function createFeatureEditorAdaptersByPanelKind(): ReadonlyMap<
  DesktopCreativePanelKind,
  WorkbenchFeatureWebviewHostAdapterDescriptor
> {
  const adaptersByPanelKind = new Map<
    DesktopCreativePanelKind,
    WorkbenchFeatureWebviewHostAdapterDescriptor
  >();
  for (const adapter of createDesktopFeatureWebviewHostAdapters()) {
    if (!adapter.customEditor) {
      continue;
    }
    const panelKind = readDesktopCreativePanelKind(adapter.customEditor.viewType);
    const previous = adaptersByPanelKind.get(panelKind);
    if (previous) {
      throw new Error(
        `Duplicate Desktop feature editor panel '${panelKind}' from ${previous.owner.id} and ${adapter.owner.id}.`,
      );
    }
    adaptersByPanelKind.set(panelKind, adapter);
  }
  return adaptersByPanelKind;
}

function createDesktopEditorAdapterDescriptor(
  adapter: WorkbenchFeatureWebviewHostAdapterDescriptor,
): DesktopEditorAdapterDescriptor {
  if (!adapter.customEditor) {
    throw new Error(`Feature Webview adapter '${adapter.id}' does not declare custom editor metadata.`);
  }
  const panelKind = readDesktopCreativePanelKind(adapter.customEditor.viewType);
  return {
    kind: readDesktopEditorKind(panelKind),
    panelKind,
    label: adapter.label ?? adapter.id,
    packageName: adapter.owner.id,
    implementedInVsCodeWebview: true,
    desktopRuntime: readDesktopRuntime(adapter),
  };
}

function readDesktopCreativePanelKind(viewType: string): DesktopCreativePanelKind {
  switch (viewType) {
    case 'canvas-workbench':
    case 'cut-timeline':
    case 'audio-timeline':
    case 'sketch-editor':
    case 'model-viewport':
    case 'media-preview':
      return viewType;
    default:
      throw new Error(`Unsupported Desktop feature editor viewType: ${viewType}`);
  }
}

function readDesktopEditorKind(panelKind: DesktopCreativePanelKind): DesktopEditorKind {
  switch (panelKind) {
    case 'canvas-workbench':
      return 'canvas';
    case 'cut-timeline':
      return 'timeline';
    case 'audio-timeline':
      return 'audio';
    case 'sketch-editor':
      return 'sketch';
    case 'model-viewport':
      return 'model';
    case 'media-preview':
      return 'media-preview';
    case 'code-editor':
      return 'code';
  }
}

function readDesktopRuntime(
  adapter: WorkbenchFeatureWebviewHostAdapterDescriptor,
): DesktopEditorAdapterDescriptor['desktopRuntime'] {
  return adapter.runtimeEntryId === '@neko/webview/root'
    ? 'full-webview-runtime'
    : 'host-adapter-projection';
}

function readLowercaseExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index).toLowerCase() : '';
}
