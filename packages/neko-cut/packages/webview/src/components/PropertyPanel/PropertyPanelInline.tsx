/**
 * PropertyPanelInline
 * Bridge component that connects EditorStore to PropertyPanel props.
 * Replaces PropertyPanelStandalone (which used postMessage IPC).
 */

import { memo, useCallback, useMemo } from 'react';
import { PropertyPanel } from './PropertyPanel';
import { useEditorStore } from '../../stores/editor-store';
import type { TimelineElement, EasingType, ProjectDefaults } from '../../types';

export const PropertyPanelInline = memo(function PropertyPanelInline() {
  const project = useEditorStore((s) => s.project);
  const selectedElements = useEditorStore((s) => s.selectedElements);
  const currentTime = useEditorStore((s) => s.currentTime);
  const updateElement = useEditorStore((s) => s.updateElement);
  const updateProject = useEditorStore((s) => s.updateProject);
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const removeKeyframe = useEditorStore((s) => s.removeKeyframe);
  const executeAIAction = useEditorStore((s) => s.executeAIAction);

  // Derive selected element (same logic as former App.tsx:104-109)
  const selectedElement = useMemo((): TimelineElement | null => {
    if (!project || selectedElements.length === 0) return null;
    const { trackId, elementId } = selectedElements[0];
    const track = project.tracks.find((t) => t.id === trackId);
    return track?.elements.find((e) => e.id === elementId) ?? null;
  }, [project, selectedElements]);

  const selectedTrackId =
    selectedElements.length > 0 ? (selectedElements[0]?.trackId ?? null) : null;

  // Map callbacks: bridge PropertyPanel's signatures to store actions
  const handleElementChange = useCallback(
    (elementId: string, changes: Partial<TimelineElement>) => {
      if (selectedTrackId) {
        updateElement(selectedTrackId, elementId, changes);
      }
    },
    [selectedTrackId, updateElement],
  );

  const handleDefaultsChange = useCallback(
    (changes: Partial<ProjectDefaults>) => {
      if (project?.defaults) {
        updateProject({ defaults: { ...project.defaults, ...changes } });
      }
    },
    [project?.defaults, updateProject],
  );

  // PropertyPanel: onAddKeyframe(elementId, propertyPath, value, easing?)
  // Store: addKeyframe(trackId, elementId, property, time, value)
  const handleAddKeyframe = useCallback(
    (elementId: string, propertyPath: string, value: number, _easing?: EasingType) => {
      if (selectedTrackId) {
        addKeyframe(selectedTrackId, elementId, propertyPath, currentTime, value);
      }
    },
    [selectedTrackId, currentTime, addKeyframe],
  );

  // PropertyPanel: onRemoveKeyframe(elementId, propertyPath)
  // Store: removeKeyframe(trackId, elementId, property, time)
  const handleRemoveKeyframe = useCallback(
    (elementId: string, propertyPath: string) => {
      if (selectedTrackId) {
        removeKeyframe(selectedTrackId, elementId, propertyPath, currentTime);
      }
    },
    [selectedTrackId, currentTime, removeKeyframe],
  );

  // PropertyPanel: onExecuteAIAction(actionId, elementIds)
  // Store: executeAIAction(actionId, elementIds, trackIds?)
  const handleExecuteAIAction = useCallback(
    (actionId: string, elementIds: string[]) => {
      executeAIAction(actionId as Parameters<typeof executeAIAction>[0], elementIds);
    },
    [executeAIAction],
  );

  return (
    <PropertyPanel
      element={selectedElement}
      projectDefaults={project?.defaults ?? null}
      currentTime={currentTime}
      onElementChange={handleElementChange}
      onDefaultsChange={handleDefaultsChange}
      onAddKeyframe={handleAddKeyframe}
      onRemoveKeyframe={handleRemoveKeyframe}
      onExecuteAIAction={handleExecuteAIAction}
    />
  );
});
