/**
 * PreviewOverlay - 预览画布交互层
 * Provides interactive editing capabilities on top of the GPU canvas
 *
 * Features:
 * - Click to select elements
 * - Drag to move elements
 * - Transform handles for scale/rotate
 * - AI quick action menu
 * - Alignment guides
 * - Marquee selection
 * - Context menu
 * - Safe zones display
 */

import { memo, useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useEditorStore } from '../../stores/editor-store';
import { useCoordinateMapping } from './hooks/useCoordinateMapping';
import { useHitTest } from './hooks/useHitTest';
import { useTransformDrag } from './hooks/useTransformDrag';
// import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'; // DISABLED - handled by global shortcuts
import { SelectionBox } from './SelectionBox';
import { AIQuickMenu } from './AIQuickMenu';
import { AlignmentGuides, calculateAlignmentGuides, snapToGuides, type AlignmentGuide } from './AlignmentGuides';
import { MarqueeSelection } from './MarqueeSelection';
import { ContextMenu } from './ContextMenu';
import { SafeZones } from './SafeZones';
import type { TimelineElement } from '@neko/shared';

export interface PreviewOverlayProps {
  /** Canvas element ref for coordinate mapping */
  canvasRef: React.RefObject<HTMLCanvasElement>;
  /** Whether the overlay is enabled */
  enabled?: boolean;
  /** Whether to show action safe zone */
  showActionSafe?: boolean;
  /** Whether to show title safe zone */
  showTitleSafe?: boolean;
}

/**
 * Preview Overlay main component
 */
export const PreviewOverlay = memo(function PreviewOverlay({
  canvasRef,
  enabled = true,
  showActionSafe = false,
  showTitleSafe = false,
}: PreviewOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Marquee selection state
  const [marqueeState, setMarqueeState] = useState({
    isActive: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });

  // Context menu state
  const [contextMenuState, setContextMenuState] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
  });

  // AI menu visibility state (for keyboard shortcut toggle)
  // DISABLED - not used anymore since keyboard shortcuts are disabled
  // const [showAIMenu, setShowAIMenu] = useState(true);
  const showAIMenu = true; // Always show AI menu

  // Get store state and actions
  const {
    project,
    currentTime,
    selectedElements,
    selectElement,
    clearSelectedElements,
    updateElement,
    pushHistory,
    // undo, // Not used - handled by global shortcuts
    // redo, // Not used - handled by global shortcuts
  } = useEditorStore();

  // Update canvas rect on resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateRect = () => {
      setCanvasRect(canvas.getBoundingClientRect());
    };

    // Initial update
    updateRect();

    // Observe resize
    const observer = new ResizeObserver(updateRect);
    observer.observe(canvas);

    // Also update on window resize (for when canvas moves)
    window.addEventListener('resize', updateRect);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateRect);
    };
  }, [canvasRef]);

  // Coordinate mapping
  const coordinateMapper = useCoordinateMapping({
    canvasRect,
    projectWidth: project?.resolution.width ?? 1920,
    projectHeight: project?.resolution.height ?? 1080,
  });

  // Hit testing
  const { hitTest, hitTestControlPoint, hitTestRect } = useHitTest({
    tracks: project?.tracks ?? [],
    currentTime,
    coordinateMapper,
  });

  // Handle transform changes
  const handleTransformChange = useCallback(
    (elementId: string, trackId: string, delta: { x?: number; y?: number; scaleX?: number; scaleY?: number; rotation?: number }) => {
      // Find the element and update it
      if (!project) return;

      const track = project.tracks.find((t) => t.id === trackId);
      if (!track) return;

      const element = track.elements.find((e) => e.id === elementId);
      if (!element) return;

      // Calculate snapped position if moving
      let finalX = delta.x;
      let finalY = delta.y;

      if (delta.x !== undefined && delta.y !== undefined) {
        const scaleX = delta.scaleX ?? element.transform?.scaleX ?? 1;
        const scaleY = delta.scaleY ?? element.transform?.scaleY ?? 1;

        const snapped = snapToGuides(delta.x, delta.y, scaleX, scaleY, 0.02);
        finalX = snapped.x;
        finalY = snapped.y;

        // Update alignment guides
        const guides = calculateAlignmentGuides(finalX, finalY, scaleX, scaleY);
        setAlignmentGuides(guides);
      }

      // Build updated transform
      const currentTransform = element.transform ?? {
        x: 0.5,
        y: 0.5,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchorX: 0.5,
        anchorY: 0.5,
      };
      const newTransform = {
        ...currentTransform,
        ...(finalX !== undefined && { x: finalX }),
        ...(finalY !== undefined && { y: finalY }),
        ...(delta.scaleX !== undefined && { scaleX: delta.scaleX }),
        ...(delta.scaleY !== undefined && { scaleY: delta.scaleY }),
        ...(delta.rotation !== undefined && { rotation: delta.rotation }),
      };

      // Update element in store
      updateElement(trackId, elementId, { transform: newTransform });
    },
    [project, updateElement]
  );

  // Handle transform end
  const handleTransformEnd = useCallback(() => {
    setAlignmentGuides([]);
    setIsDragging(false);
  }, []);

  // Transform drag hook
  const transformDrag = useTransformDrag({
    coordinateMapper,
    onTransformChange: handleTransformChange,
    onTransformEnd: handleTransformEnd,
  });

  // Get selected elements with full data
  const selectedElementsWithData = useMemo(() => {
    if (!project) return [];

    const result: Array<{ element: TimelineElement; trackId: string }> = [];

    for (const sel of selectedElements) {
      const track = project.tracks.find((t) => t.id === sel.trackId);
      if (track) {
        const element = track.elements.find((e) => e.id === sel.elementId);
        if (element) {
          result.push({ element, trackId: sel.trackId });
        }
      }
    }

    return result;
  }, [project, selectedElements]);

  // Calculate AI menu position (top-right of first selected element)
  const aiMenuPosition = useMemo(() => {
    if (selectedElementsWithData.length === 0) {
      return { x: 0, y: 0 };
    }

    const firstElement = selectedElementsWithData[0].element;
    const transform = firstElement.transform;
    const x = transform?.x ?? 0.5;
    const y = transform?.y ?? 0.5;
    const scaleX = transform?.scaleX ?? 1;

    // Top-right corner
    const topRightX = x + scaleX / 2;
    const topRightY = y - (transform?.scaleY ?? 1) / 2;

    return coordinateMapper.projectToCanvas(topRightX, topRightY);
  }, [selectedElementsWithData, coordinateMapper]);

  // Handle mouse down
  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (!enabled || !canvasRect) return;

      // Only handle left mouse button
      if (event.button !== 0) return;

      const rect = canvasRect;
      const canvasX = event.clientX - rect.left;
      const canvasY = event.clientY - rect.top;

      // Check if click is in effective area
      if (!coordinateMapper.isPointInEffectiveArea(canvasX, canvasY)) {
        return;
      }

      // Check if clicking on a control point of selected element
      if (selectedElementsWithData.length > 0) {
        const firstSelected = selectedElementsWithData[0];
        const controlPointHit = hitTestControlPoint(
          canvasX,
          canvasY,
          firstSelected.element.id,
          firstSelected.trackId
        );

        if (controlPointHit) {
          event.preventDefault();
          event.stopPropagation();

          // Save history before transform starts (for undo support)
          if (project) {
            pushHistory(project, true); // immediate: bypass debounce
          }

          if (controlPointHit.type === 'rotate') {
            transformDrag.startRotate(
              firstSelected.element,
              firstSelected.trackId,
              canvasX,
              canvasY
            );
          } else {
            transformDrag.startScale(
              firstSelected.element,
              firstSelected.trackId,
              controlPointHit.position,
              canvasX,
              canvasY
            );
          }
          setIsDragging(true);
          return;
        }
      }

      // Hit test for elements
      const hit = hitTest(canvasX, canvasY);

      if (hit) {
        // Check if this element is already selected
        const isAlreadySelected = selectedElements.some(
          (sel) => sel.elementId === hit.elementId && sel.trackId === hit.trackId
        );

        if (!isAlreadySelected) {
          // Select the element
          const isMultiSelect = event.shiftKey || event.metaKey || event.ctrlKey;
          selectElement(hit.trackId, hit.elementId, isMultiSelect);
        }

        // Save history before transform starts (for undo support)
        if (project) {
          pushHistory(project, true); // immediate: bypass debounce
        }

        // Start move transform
        event.preventDefault();
        transformDrag.startMove(hit.element, hit.trackId, canvasX, canvasY);
        setIsDragging(true);
      } else {
        // No element hit - start marquee selection
        event.preventDefault();
        setMarqueeState({
          isActive: true,
          startX: canvasX,
          startY: canvasY,
          currentX: canvasX,
          currentY: canvasY,
        });
      }
    },
    [
      enabled,
      canvasRect,
      coordinateMapper,
      selectedElementsWithData,
      selectedElements,
      hitTest,
      hitTestControlPoint,
      selectElement,
      transformDrag,
      project,
      pushHistory,
    ]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!canvasRect) return;

      const rect = canvasRect;
      const canvasX = event.clientX - rect.left;
      const canvasY = event.clientY - rect.top;

      // Update transform if transforming
      if (transformDrag.state.isTransforming) {
        transformDrag.updateTransform(canvasX, canvasY, event.shiftKey);
        return;
      }

      // Update marquee selection if active
      if (marqueeState.isActive) {
        setMarqueeState((prev) => ({
          ...prev,
          currentX: canvasX,
          currentY: canvasY,
        }));
      }
    },
    [transformDrag, canvasRect, marqueeState.isActive]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    // Finalize transform
    if (transformDrag.state.isTransforming) {
      transformDrag.endTransform();
    }

    // Finalize marquee selection
    if (marqueeState.isActive) {
      const { startX, startY, currentX, currentY } = marqueeState;

      // Only select if marquee was large enough
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      if (width > 5 || height > 5) {
        const hits = hitTestRect(startX, startY, currentX, currentY);

        // Clear previous selection and select all hit elements
        clearSelectedElements();
        for (const hit of hits) {
          selectElement(hit.trackId, hit.elementId, true);
        }
      }

      // Reset marquee state
      setMarqueeState({
        isActive: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
      });
    }
  }, [transformDrag, marqueeState, hitTestRect, clearSelectedElements, selectElement]);

  // Handle click (for selection when not dragging)
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!enabled || !canvasRect || isDragging) return;

      const rect = canvasRect;
      const canvasX = event.clientX - rect.left;
      const canvasY = event.clientY - rect.top;

      // Check if click is in effective area
      if (!coordinateMapper.isPointInEffectiveArea(canvasX, canvasY)) {
        clearSelectedElements();
        return;
      }

      // Hit test
      const hit = hitTest(canvasX, canvasY);

      if (!hit) {
        // Click on empty space - clear selection
        clearSelectedElements();
      }
    },
    [enabled, canvasRect, isDragging, coordinateMapper, hitTest, clearSelectedElements]
  );

  // Add global mouse listeners for drag operations
  useEffect(() => {
    if (!transformDrag.state.isTransforming) return;

    const handleGlobalMouseMove = (event: MouseEvent) => {
      if (!canvasRect) return;
      const rect = canvasRect;
      const canvasX = event.clientX - rect.left;
      const canvasY = event.clientY - rect.top;
      transformDrag.updateTransform(canvasX, canvasY, event.shiftKey);
    };

    const handleGlobalMouseUp = () => {
      transformDrag.endTransform();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        transformDrag.cancelTransform();
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [transformDrag, canvasRect]);

  // Handle AI action execution
  const handleExecuteAIAction = useCallback(
    (actionId: string, elementIds: string[]) => {
      // Send message to extension
      try {
        const vscode = (window as { vscode?: { postMessage: (msg: unknown) => void } }).vscode;
        if (vscode?.postMessage) {
          vscode.postMessage({
            type: 'executeAIAction',
            actionId,
            elementIds,
          });
        }
      } catch (err) {
        console.warn('[PreviewOverlay] Failed to send AI action:', err);
      }
    },
    []
  );

  // Handle context menu (right-click)
  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!enabled || !canvasRect) return;

      event.preventDefault();
      event.stopPropagation();

      setContextMenuState({
        isOpen: true,
        position: { x: event.clientX, y: event.clientY },
      });
    },
    [enabled, canvasRect]
  );

  // Close context menu
  const handleCloseContextMenu = useCallback(() => {
    setContextMenuState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Edit action handlers
  const handleCut = useCallback(() => {
    if (selectedElements.length === 0) return;
    // TODO: Implement cut (copy to clipboard + delete)
    console.log('[PreviewOverlay] Cut:', selectedElements);
  }, [selectedElements]);

  const handleCopy = useCallback(() => {
    if (selectedElements.length === 0) return;
    // TODO: Implement copy to clipboard
    console.log('[PreviewOverlay] Copy:', selectedElements);
  }, [selectedElements]);

  const handlePaste = useCallback(() => {
    // TODO: Implement paste from clipboard
    console.log('[PreviewOverlay] Paste');
  }, []);

  const handleDelete = useCallback(() => {
    if (selectedElements.length === 0 || !project) return;

    // Delete each selected element
    for (const sel of selectedElements) {
      const track = project.tracks.find((t) => t.id === sel.trackId);
      if (track) {
        const element = track.elements.find((e) => e.id === sel.elementId);
        if (element) {
          // Use store's deleteElement if available, or send message to extension
          try {
            const vscode = (window as { vscode?: { postMessage: (msg: unknown) => void } }).vscode;
            if (vscode?.postMessage) {
              vscode.postMessage({
                type: 'deleteElement',
                trackId: sel.trackId,
                elementId: sel.elementId,
              });
            }
          } catch (err) {
            console.warn('[PreviewOverlay] Failed to delete element:', err);
          }
        }
      }
    }
    clearSelectedElements();
  }, [selectedElements, project, clearSelectedElements]);

  const handleDuplicate = useCallback(() => {
    if (selectedElements.length === 0) return;
    // TODO: Implement duplicate
    console.log('[PreviewOverlay] Duplicate:', selectedElements);
  }, [selectedElements]);

  const handleAlign = useCallback(
    (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
      if (selectedElementsWithData.length === 0) return;

      for (const { element, trackId } of selectedElementsWithData) {
        const currentTransform = element.transform ?? {
          x: 0.5,
          y: 0.5,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          anchorX: 0.5,
          anchorY: 0.5,
        };

        let newX = currentTransform.x;
        let newY = currentTransform.y;

        switch (alignment) {
          case 'left':
            newX = currentTransform.scaleX / 2;
            break;
          case 'center':
            newX = 0.5;
            break;
          case 'right':
            newX = 1 - currentTransform.scaleX / 2;
            break;
          case 'top':
            newY = currentTransform.scaleY / 2;
            break;
          case 'middle':
            newY = 0.5;
            break;
          case 'bottom':
            newY = 1 - currentTransform.scaleY / 2;
            break;
        }

        updateElement(trackId, element.id, {
          transform: { ...currentTransform, x: newX, y: newY },
        });
      }
    },
    [selectedElementsWithData, updateElement]
  );

  // Handle select all visible elements
  // DISABLED - handled by global shortcuts
  /*
  const handleSelectAll = useCallback(() => {
    if (!project) return;

    // Get all visible elements at current time
    const visibleElements: Array<{ trackId: string; elementId: string }> = [];

    for (const track of project.tracks) {
      for (const element of track.elements) {
        const effectiveStart = element.startTime + element.trimStart;
        const effectiveEnd = element.startTime + element.duration - element.trimEnd;

        if (currentTime >= effectiveStart && currentTime < effectiveEnd) {
          if (!element.hidden && element.type !== 'audio') {
            visibleElements.push({ trackId: track.id, elementId: element.id });
          }
        }
      }
    }

    // Select all visible elements
    clearSelectedElements();
    for (const item of visibleElements) {
      selectElement(item.trackId, item.elementId, true);
    }
  }, [project, currentTime, clearSelectedElements, selectElement]);
  */

  // Handle nudge (arrow key movement)
  // DISABLED - handled by global shortcuts
  /*
  const handleNudge = useCallback(
    (dx: number, dy: number) => {
      if (selectedElementsWithData.length === 0) return;

      for (const { element, trackId } of selectedElementsWithData) {
        const currentTransform = element.transform ?? {
          x: 0.5,
          y: 0.5,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          anchorX: 0.5,
          anchorY: 0.5,
        };

        // Calculate new position with bounds checking
        const newX = Math.max(0, Math.min(1, currentTransform.x + dx));
        const newY = Math.max(0, Math.min(1, currentTransform.y + dy));

        updateElement(trackId, element.id, {
          transform: { ...currentTransform, x: newX, y: newY },
        });
      }
    },
    [selectedElementsWithData, updateElement]
  );
  */

  // Handle toggle AI menu
  // DISABLED - handled by global shortcuts
  /*
  const handleToggleAIMenu = useCallback(() => {
    setShowAIMenu((prev) => !prev);
  }, []);
  */

  // Handle escape key
  // DISABLED - handled by global shortcuts
  /*
  const handleEscape = useCallback(() => {
    // Close context menu if open
    if (contextMenuState.isOpen) {
      setContextMenuState((prev) => ({ ...prev, isOpen: false }));
      return;
    }

    // Cancel transform if in progress
    if (transformDrag.state.isTransforming) {
      transformDrag.cancelTransform();
      return;
    }

    // Clear selection
    clearSelectedElements();
  }, [contextMenuState.isOpen, transformDrag, clearSelectedElements]);
  */

  // Keyboard shortcuts - DISABLED
  // All keyboard shortcuts are handled by the global timeline shortcuts
  // to avoid conflicts and ensure consistent behavior
  /*
  useKeyboardShortcuts({
    enabled: enabled && !!project && !!canvasRect,
    selectedElementIds: selectedElements.map((sel) => sel.elementId),
    onDelete: handleDelete,
    onCopy: handleCopy,
    onCut: handleCut,
    onPaste: handlePaste,
    onDuplicate: handleDuplicate,
    onSelectAll: handleSelectAll,
    onClearSelection: clearSelectedElements,
    onNudge: handleNudge,
    onOpenAIMenu: handleToggleAIMenu,
    onEscape: handleEscape,
    onUndo: undo,
    onRedo: redo,
  });
  */

  // Get cursor style based on current state
  const getCursor = useCallback(() => {
    if (marqueeState.isActive) {
      return 'crosshair';
    }
    if (transformDrag.state.isTransforming) {
      switch (transformDrag.state.type) {
        case 'move':
          return 'grabbing';
        case 'rotate':
          return 'grabbing';
        case 'scale':
          return 'nwse-resize';
        default:
          return 'default';
      }
    }
    return 'default';
  }, [transformDrag.state, marqueeState.isActive]);

  // Don't render if disabled or no project
  if (!enabled || !project || !canvasRect) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        cursor: getCursor(),
        pointerEvents: 'auto',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {/* Safe zones */}
      {(showActionSafe || showTitleSafe) && (
        <SafeZones
          coordinateMapper={coordinateMapper}
          showActionSafe={showActionSafe}
          showTitleSafe={showTitleSafe}
        />
      )}

      {/* Alignment guides */}
      {alignmentGuides.length > 0 && (
        <AlignmentGuides
          guides={alignmentGuides}
          coordinateMapper={coordinateMapper}
        />
      )}

      {/* Marquee selection */}
      <MarqueeSelection
        startX={marqueeState.startX}
        startY={marqueeState.startY}
        currentX={marqueeState.currentX}
        currentY={marqueeState.currentY}
        isActive={marqueeState.isActive}
      />

      {/* Selection boxes for selected elements */}
      {selectedElementsWithData.map(({ element, trackId }, index) => (
        <SelectionBox
          key={`${trackId}-${element.id}`}
          element={element}
          coordinateMapper={coordinateMapper}
          isPrimary={index === 0}
        />
      ))}

      {/* AI Quick Menu (hide during transform and marquee, toggleable via Cmd+Shift+A) */}
      {showAIMenu &&
        selectedElementsWithData.length > 0 &&
        !transformDrag.state.isTransforming &&
        !marqueeState.isActive && (
          <AIQuickMenu
            selectedElements={selectedElementsWithData}
            position={aiMenuPosition}
            onExecuteAction={handleExecuteAIAction}
          />
        )}

      {/* Context Menu */}
      {contextMenuState.isOpen && (
        <ContextMenu
          position={contextMenuState.position}
          selectedElements={selectedElementsWithData}
          onClose={handleCloseContextMenu}
          onCut={handleCut}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onExecuteAIAction={handleExecuteAIAction}
          onAlign={handleAlign}
        />
      )}
    </div>
  );
});

export default PreviewOverlay;
