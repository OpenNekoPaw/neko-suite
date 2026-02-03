/**
 * PropertyPanelStandalone Component
 * Wraps PropertyPanel with VSCode webview messaging for standalone use
 */

import { memo, useCallback, useEffect, useState } from 'react';
import { PropertyPanel } from './PropertyPanel';
import type { TimelineElement, EasingType, ProjectDefaults } from '../../types';
import { getVSCodeAPI } from '../../utils/vscodeApi';

interface PanelState {
  element: TimelineElement | null;
  trackId: string | null;
  currentTime: number;
  projectDefaults: ProjectDefaults | null;
}

export const PropertyPanelStandalone = memo(function PropertyPanelStandalone() {
  const [state, setState] = useState<PanelState>({
    element: null,
    trackId: null,
    currentTime: 0,
    projectDefaults: null,
  });

  // Handle messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case 'selectedElement':
          setState(prev => ({
            ...prev,
            element: message.element,
            trackId: message.trackId,
            currentTime: message.currentTime,
          }));
          break;

        case 'currentTimeUpdate':
          setState(prev => ({
            ...prev,
            currentTime: message.currentTime,
          }));
          break;

        case 'projectDefaults':
          setState(prev => ({
            ...prev,
            projectDefaults: message.defaults,
          }));
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // Notify extension that we're ready
    const vscode = getVSCodeAPI();
    vscode?.postMessage({ type: 'ready' });

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Handle element property changes
  const handleElementChange = useCallback((elementId: string, changes: Partial<TimelineElement>) => {
    const vscode = getVSCodeAPI();
    vscode?.postMessage({
      type: 'propertyChange',
      elementId,
      changes,
    });
  }, []);

  // Handle defaults property changes
  const handleDefaultsChange = useCallback((changes: Partial<ProjectDefaults>) => {
    const vscode = getVSCodeAPI();
    vscode?.postMessage({
      type: 'defaultsChange',
      changes,
    });
  }, []);

  // Handle add keyframe
  const handleAddKeyframe = useCallback((
    elementId: string,
    propertyPath: string,
    value: number,
    easing?: EasingType
  ) => {
    const vscode = getVSCodeAPI();
    vscode?.postMessage({
      type: 'addKeyframe',
      elementId,
      propertyPath,
      value,
      easing,
    });
  }, []);

  // Handle remove keyframe
  const handleRemoveKeyframe = useCallback((elementId: string, propertyPath: string) => {
    const vscode = getVSCodeAPI();
    vscode?.postMessage({
      type: 'removeKeyframe',
      elementId,
      propertyPath,
    });
  }, []);

  return (
    <div className="h-full bg-[var(--vscode-sideBar-background)]">
      <PropertyPanel
        element={state.element}
        projectDefaults={state.projectDefaults}
        currentTime={state.currentTime}
        onElementChange={handleElementChange}
        onDefaultsChange={handleDefaultsChange}
        onAddKeyframe={handleAddKeyframe}
        onRemoveKeyframe={handleRemoveKeyframe}
      />
    </div>
  );
});

export default PropertyPanelStandalone;
