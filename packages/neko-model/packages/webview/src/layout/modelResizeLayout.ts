export interface ModelResizePanelSpec {
  readonly panelId: string;
  readonly defaultSize: number;
  readonly minSize: number;
  readonly maxSize: number;
}

export const MODEL_RIGHT_DOCK_SPLIT_HANDLE_SIZE = 4;
export const MODEL_RIGHT_DOCK_MIN_PROPERTIES_SIZE = 120;

export const MODEL_RESIZE_PANELS = {
  rightDock: {
    panelId: 'model.rightDock',
    defaultSize: 320,
    minSize: 260,
    maxSize: 460,
  },
  outlinerSplit: {
    panelId: 'model.outlinerSplit',
    defaultSize: 210,
    minSize: 150,
    maxSize: 360,
  },
  timelineCompact: {
    panelId: 'model.timelineDock.compact',
    defaultSize: 86,
    minSize: 72,
    maxSize: 160,
  },
  timelineExpanded: {
    panelId: 'model.timelineDock.expanded',
    defaultSize: 192,
    minSize: 140,
    maxSize: 360,
  },
} as const satisfies Record<string, ModelResizePanelSpec>;

export function constrainOutlinerSplitSize(
  requestedSize: number,
  containerHeight: number,
  spec: ModelResizePanelSpec = MODEL_RESIZE_PANELS.outlinerSplit,
): number {
  const containerMaxSize =
    Number.isFinite(containerHeight) && containerHeight > 0
      ? Math.max(
          spec.minSize,
          containerHeight -
            MODEL_RIGHT_DOCK_SPLIT_HANDLE_SIZE -
            MODEL_RIGHT_DOCK_MIN_PROPERTIES_SIZE,
        )
      : spec.maxSize;
  const maxSize = Math.min(spec.maxSize, containerMaxSize);

  return Math.max(spec.minSize, Math.min(maxSize, requestedSize));
}
