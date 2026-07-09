import { describe, expect, it } from 'vitest';
import type {
  WorkbenchContributionOwner,
  WorkbenchFeatureWebviewHostAdapterDescriptor,
} from './index';
import {
  WorkbenchFeatureWebviewAdapterRegistrationError,
  createWorkbenchFeatureWebviewAdapterRegistry,
} from './index';

const owner: WorkbenchContributionOwner = {
  id: '@neko-canvas/webview',
  kind: 'core-package',
  displayName: 'Neko Canvas',
  trust: 'core',
};

const canvasAdapter: WorkbenchFeatureWebviewHostAdapterDescriptor = {
  id: 'neko.canvas.webview.host-adapter',
  owner,
  label: 'Canvas',
  surface: 'custom-editor',
  runtimeEntryId: '@neko-canvas/webview/host-adapter',
  supportedHosts: ['vscode', 'electron'],
  requiredHostCapabilities: ['workbench.customEditors', 'workbench.webviews'],
  customEditor: {
    contributionId: 'neko.canvas.editor.canvas-workbench',
    viewType: 'canvas-workbench',
    selectors: [{ extension: '.nkc' }],
    runtime: 'package-host-adapter',
    priority: 'default',
  },
  theme: {
    usesWorkbenchTheme: true,
    tokenScope: 'neko.canvas',
  },
  i18n: {
    namespace: 'neko-canvas',
    supportedLocales: ['en', 'zh-cn'],
  },
};

describe('feature Webview host adapter registry', () => {
  it('registers host-neutral descriptors and projects custom editor contributions', () => {
    const registry = createWorkbenchFeatureWebviewAdapterRegistry({
      hostKind: 'electron',
      hostCapabilities: ['workbench.customEditors', 'workbench.webviews'],
    });

    registry.register(canvasAdapter);

    expect(registry.snapshot().adapters).toEqual([canvasAdapter]);
    expect(registry.snapshot().diagnostics).toEqual([]);
    expect(registry.toCustomEditorContribution('neko.canvas.webview.host-adapter')).toEqual({
      id: 'neko.canvas.editor.canvas-workbench',
      kind: 'custom-editor',
      owner,
      label: 'Canvas',
      viewType: 'canvas-workbench',
      selectors: [{ extension: '.nkc' }],
      runtime: 'package-host-adapter',
      priority: 'default',
      supportedHosts: ['vscode', 'electron'],
      requiredHostCapabilities: ['workbench.customEditors', 'workbench.webviews'],
    });
    expect(JSON.stringify(canvasAdapter)).not.toContain('React');
    expect(JSON.stringify(canvasAdapter)).not.toContain('vscode.');
    expect(JSON.stringify(canvasAdapter)).not.toContain('Electron');
  });

  it('fails visibly for duplicate adapter ids', () => {
    const registry = createWorkbenchFeatureWebviewAdapterRegistry();
    registry.register(canvasAdapter);

    expect(() => registry.register(canvasAdapter)).toThrow(
      WorkbenchFeatureWebviewAdapterRegistrationError,
    );
    try {
      registry.register(canvasAdapter);
    } catch (error) {
      expect(error).toBeInstanceOf(WorkbenchFeatureWebviewAdapterRegistrationError);
      expect((error as WorkbenchFeatureWebviewAdapterRegistrationError).diagnostic.code).toBe(
        'duplicateFeatureWebviewAdapterId',
      );
    }
  });

  it('fails visibly for unsupported host requirements', () => {
    const registry = createWorkbenchFeatureWebviewAdapterRegistry({
      hostKind: 'tui',
      hostCapabilities: ['workbench.customEditors', 'workbench.webviews'],
    });

    expect(() => registry.register(canvasAdapter)).toThrow(/does not support host 'tui'/);
    try {
      registry.register(canvasAdapter);
    } catch (error) {
      expect(error).toBeInstanceOf(WorkbenchFeatureWebviewAdapterRegistrationError);
      const diagnostic = (error as WorkbenchFeatureWebviewAdapterRegistrationError)
        .diagnostic;
      expect(diagnostic.code).toBe('unsupportedFeatureWebviewAdapterHost');
      expect(diagnostic.metadata).toEqual({
        hostKind: 'tui',
        supportedHosts: ['vscode', 'electron'],
      });
    }
  });

  it('fails visibly for unsupported host capabilities', () => {
    const registry = createWorkbenchFeatureWebviewAdapterRegistry({
      hostKind: 'electron',
      hostCapabilities: ['workbench.webviews'],
    });

    expect(() => registry.register(canvasAdapter)).toThrow(
      /requires unsupported host capabilities/,
    );
    try {
      registry.register(canvasAdapter);
    } catch (error) {
      expect(error).toBeInstanceOf(WorkbenchFeatureWebviewAdapterRegistrationError);
      const diagnostic = (error as WorkbenchFeatureWebviewAdapterRegistrationError)
        .diagnostic;
      expect(diagnostic.code).toBe('missingFeatureWebviewHostCapability');
      expect(diagnostic.metadata).toEqual({ missing: ['workbench.customEditors'] });
    }
  });

  it('fails visibly when a custom editor adapter omits editor metadata', () => {
    const registry = createWorkbenchFeatureWebviewAdapterRegistry({
      hostKind: 'electron',
      hostCapabilities: ['workbench.customEditors', 'workbench.webviews'],
    });
    const invalidAdapter: WorkbenchFeatureWebviewHostAdapterDescriptor = {
      ...canvasAdapter,
      customEditor: undefined,
    };

    expect(() => registry.register(invalidAdapter)).toThrow(
      WorkbenchFeatureWebviewAdapterRegistrationError,
    );
    try {
      registry.register(invalidAdapter);
    } catch (error) {
      expect(error).toBeInstanceOf(WorkbenchFeatureWebviewAdapterRegistrationError);
      expect((error as WorkbenchFeatureWebviewAdapterRegistrationError).diagnostic.code).toBe(
        'missingFeatureWebviewCustomEditor',
      );
    }
  });

  it('rejects runtime handles and non-string runtime entries', () => {
    const runtimeHandleAdapter = {
      ...canvasAdapter,
      runtimeEntryId: 'engine-token:frame-stream',
    };
    const reactHandleAdapter = {
      ...canvasAdapter,
      runtimeEntryId: { type: 'ReactElement' } as unknown as string,
    };
    const registry = createWorkbenchFeatureWebviewAdapterRegistry();

    expect(() => registry.register(runtimeHandleAdapter)).toThrow(
      /runtime entry must be portable/,
    );
    expect(() => registry.register(reactHandleAdapter)).toThrow(
      /must declare a runtime entry id/,
    );
  });

  it('fails visibly for unknown adapter references', () => {
    const registry = createWorkbenchFeatureWebviewAdapterRegistry();

    expect(() => registry.toCustomEditorContribution('neko.unknown.adapter')).toThrow(
      WorkbenchFeatureWebviewAdapterRegistrationError,
    );
  });
});
