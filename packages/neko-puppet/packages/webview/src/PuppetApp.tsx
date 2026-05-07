/**
 * PuppetApp - Root component for the puppet editor
 *
 * Manages puppet loading (INP/MOC3), parameter control, and animation playback.
 * Communicates with the extension host via postMessage protocol.
 */
import React, { useEffect, useCallback, useRef, useState } from 'react';
import type { ExtensionToWebviewMessage } from './types';
import { usePuppetStore } from './stores/puppet-store';
import { AnimationPanel } from './components/AnimationPanel';
import { ParameterPanel } from './components/ParameterPanel';
import { PuppetNodeTree } from './components/PuppetNodeTree';
import { PuppetKeyframeTimeline } from './components/PuppetKeyframeTimeline';
import { PuppetCanvas } from './components/PuppetCanvas';
import { parseInpTextures } from './utils/inp-parser';
import { PuppetController } from './animation';
import { usePuppetPlayback } from './hooks/usePuppetPlayback';
import { i18nService, setLocale } from './i18n';
import { I18nProvider, useTranslation } from './i18n/I18nContext';
import type { SupportedLocale } from '@neko/shared';
import { EngineClient } from '@neko/neko-client';

// Acquire VSCode API once
const vscode = (window as unknown as { acquireVsCodeApi: () => VsCodeApi }).acquireVsCodeApi();

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

/** Debounce timer ref for parameter save */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Send current parameters to extension for persistence */
function saveParametersToExtension(): void {
  const params = usePuppetStore.getState().puppetParameters;
  const paramMap: Record<string, number> = {};
  for (const p of params) {
    paramMap[p.name] = p.current;
  }
  vscode.postMessage({ type: 'state:save', parameters: paramMap });
}

/** Debounced parameter save (300ms) */
function debouncedSaveParameters(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveParametersToExtension, 300);
}

function PuppetWaitingPlaceholder() {
  const { t } = useTranslation();
  return <span>{t('puppet.status.loading')}</span>;
}

/** Empty state UI — import, template, or drag-drop */
function PuppetEmptyState() {
  const { t } = useTranslation();
  const [isDragOver, setIsDragOver] = useState(false);

  const handleImport = useCallback(() => {
    vscode.postMessage({ type: 'puppet:import' });
  }, []);

  const handleTemplate = useCallback((templateId: string) => {
    vscode.postMessage({ type: 'puppet:template', templateId });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.inp') || file.name.endsWith('.moc3'))) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] ?? '';
        vscode.postMessage({ type: 'puppet:dropFile', name: file.name, data: base64 });
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const btnClass =
    'px-4 py-2 rounded text-xs cursor-pointer transition-colors ' +
    'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] ' +
    'hover:bg-[var(--vscode-button-secondaryHoverBackground)]';
  const primaryBtnClass =
    'px-4 py-2 rounded text-xs cursor-pointer transition-colors ' +
    'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] ' +
    'hover:bg-[var(--vscode-button-hoverBackground)]';

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex-1 flex flex-col items-center justify-center gap-5 text-sm transition-colors ${
        isDragOver ? 'bg-[var(--vscode-list-hoverBackground)]' : ''
      }`}
    >
      <div className="opacity-40 text-center">{t('puppet.empty.hint')}</div>

      <div className="flex gap-3">
        <button type="button" onClick={handleImport} className={primaryBtnClass}>
          {t('puppet.empty.import')}
        </button>
        <button type="button" onClick={() => handleTemplate('blank')} className={btnClass}>
          {t('puppet.empty.templateBlank')}
        </button>
        <button type="button" onClick={() => handleTemplate('humanoid')} className={btnClass}>
          {t('puppet.empty.templateHumanoid')}
        </button>
      </div>
    </div>
  );
}

export function PuppetApp() {
  const controllerRef = useRef<PuppetController | null>(null);
  const { onPlay, onStop, onSeek, onCrossfade } = usePuppetPlayback(controllerRef.current);
  const puppetLoaded = usePuppetStore((s) => s.puppetLoaded);
  const noPuppetSource = usePuppetStore((s) => s.noPuppetSource);
  const isKeyframeEditorOpen = usePuppetStore((s) => s.isKeyframeEditorOpen);
  const toggleKeyframeEditor = usePuppetStore((s) => s.toggleKeyframeEditor);

  /** Pending parameter overrides received before puppet loads */
  const pendingStateRef = useRef<Record<string, number> | null>(null);

  // Notify extension that webview is ready
  useEffect(() => {
    vscode.postMessage({ type: 'ready' });
  }, []);

  // Handle messages from extension
  const handleMessage = useCallback((event: MessageEvent<ExtensionToWebviewMessage>) => {
    const msg = event.data;
    switch (msg.type) {
      case 'enginePort': {
        const engine = new EngineClient(msg.port);
        controllerRef.current = new PuppetController(engine);
        break;
      }

      case 'loadPuppet': {
        const ctrl = controllerRef.current;
        if (!ctrl) {
          // Request engine port first, then retry
          vscode.postMessage({ type: 'requestEnginePort' });
          break;
        }

        // Decode base64 → ArrayBuffer and load puppet
        const binaryStr = atob(msg.data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        // Parse textures from INP binary (before engine load)
        void parseInpTextures(bytes).then((textures) => {
          usePuppetStore.getState().setTextures(textures);
        });

        void ctrl.load(bytes.buffer).then(async (snapshot) => {
          const store = usePuppetStore.getState();
          store.setPuppetSnapshot(snapshot);
          store.setPuppetLoaded(true);
          store.setNoPuppetSource(false);

          // Get initial deformed meshes for rendering
          const meshes = await ctrl.getMeshes();
          console.log('[PuppetApp] deformedMesh[0] vertices:', JSON.stringify(meshes[0]?.vertices));
          console.log(
            '[PuppetApp] snapshot[0] indices:',
            JSON.stringify(snapshot.meshes?.[0]?.indices),
          );
          console.log('[PuppetApp] snapshot[0] uvs:', JSON.stringify(snapshot.meshes?.[0]?.uvs));
          console.log(
            '[PuppetApp] textures:',
            store.textures.length,
            store.textures[0]?.width,
            store.textures[0]?.height,
          );
          store.setDeformedMeshes(meshes);

          // Load parameters and animations
          const params = await ctrl.getParameters();
          store.setPuppetParameters(params);
          vscode.postMessage({
            type: 'puppet:parametersLoaded',
            parameters: params.map((param) => param.name),
          });

          // Apply pending parameter overrides if any
          const pending = pendingStateRef.current;
          if (pending) {
            pendingStateRef.current = null;
            for (const p of params) {
              const override = pending[p.name];
              if (override !== undefined) {
                store.updateParameterValue(p.name, override);
                void ctrl.setParameter(p.name, override);
              }
            }
          }

          const anims = await ctrl.getAnimations();
          store.setAnimations(anims);
        });
        break;
      }

      case 'loadState': {
        // Parameter overrides from .nkp project
        const store = usePuppetStore.getState();
        if (store.puppetLoaded && controllerRef.current) {
          // Apply immediately
          const ctrl = controllerRef.current;
          for (const [name, value] of Object.entries(msg.parameters)) {
            store.updateParameterValue(name, value);
            void ctrl.setParameter(name, value);
          }
        } else {
          // Buffer until puppet loads
          pendingStateRef.current = msg.parameters;
        }
        break;
      }

      case 'noPuppetSource': {
        usePuppetStore.getState().setNoPuppetSource(true);
        break;
      }

      case 'puppetImported': {
        usePuppetStore.getState().setNoPuppetSource(false);
        break;
      }

      case 'setLocale': {
        setLocale(msg.locale as SupportedLocale);
        break;
      }

      default:
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Subscribe to parameter changes and debounce-save to extension
  useEffect(() => {
    let prev = usePuppetStore.getState().puppetParameters;
    const unsub = usePuppetStore.subscribe((state) => {
      if (state.puppetParameters !== prev) {
        prev = state.puppetParameters;
        if (state.puppetLoaded) {
          debouncedSaveParameters();
        }
      }
    });
    return unsub;
  }, []);

  return (
    <I18nProvider service={i18nService}>
      <div className="flex flex-col h-screen w-screen overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          {/* Main content area */}
          {noPuppetSource ? (
            <div className="flex-1 flex items-center justify-center text-sm opacity-50">
              <PuppetEmptyState />
            </div>
          ) : puppetLoaded ? (
            <PuppetCanvas />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm opacity-50">
              <PuppetWaitingPlaceholder />
            </div>
          )}

          {/* Right side panels */}
          <div className="flex flex-col w-60 border-l border-[var(--sketch-border)] overflow-y-auto">
            {puppetLoaded && (
              <>
                <PuppetNodeTree />
                <ParameterPanel controller={controllerRef.current} />
                <AnimationPanel
                  onPlay={onPlay}
                  onStop={onStop}
                  onSeek={onSeek}
                  onCrossfade={onCrossfade}
                />
              </>
            )}
          </div>
        </div>

        {/* Bottom keyframe editor (collapsible) */}
        {puppetLoaded && (
          <div className="flex flex-col border-t border-[var(--sketch-border)]">
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
              onClick={toggleKeyframeEditor}
              aria-expanded={isKeyframeEditorOpen}
              aria-label={
                isKeyframeEditorOpen ? 'Collapse keyframe editor' : 'Expand keyframe editor'
              }
            >
              <span className="w-3 text-center" aria-hidden>
                {isKeyframeEditorOpen ? '▾' : '▸'}
              </span>
              <span>Keyframes</span>
            </button>
            {isKeyframeEditorOpen && (
              <div style={{ height: 180 }}>
                <PuppetKeyframeTimeline controller={controllerRef.current} />
              </div>
            )}
          </div>
        )}
      </div>
    </I18nProvider>
  );
}
