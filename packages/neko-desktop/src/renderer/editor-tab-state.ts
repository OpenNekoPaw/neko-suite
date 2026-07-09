export interface DesktopEditorTabState {
  readonly openFileIds: readonly string[];
  readonly activeFileId: string | undefined;
}

export function openDesktopEditorTab(
  state: DesktopEditorTabState,
  fileId: string,
): DesktopEditorTabState {
  return {
    openFileIds: state.openFileIds.includes(fileId)
      ? state.openFileIds
      : [...state.openFileIds, fileId],
    activeFileId: fileId,
  };
}

export function closeDesktopEditorTab(
  state: DesktopEditorTabState,
  fileId: string,
): DesktopEditorTabState {
  const closingIndex = state.openFileIds.indexOf(fileId);
  if (closingIndex < 0) return state;

  const openFileIds = state.openFileIds.filter((id) => id !== fileId);
  if (state.activeFileId !== fileId) {
    return {
      openFileIds,
      activeFileId: openFileIds.includes(state.activeFileId ?? '')
        ? state.activeFileId
        : openFileIds[0],
    };
  }

  return {
    openFileIds,
    activeFileId: openFileIds[closingIndex] ?? openFileIds[closingIndex - 1],
  };
}

export function reorderDesktopEditorTab(
  state: DesktopEditorTabState,
  sourceFileId: string,
  targetFileId: string,
): DesktopEditorTabState {
  if (sourceFileId === targetFileId) return state;

  const sourceIndex = state.openFileIds.indexOf(sourceFileId);
  const targetIndex = state.openFileIds.indexOf(targetFileId);
  if (sourceIndex < 0 || targetIndex < 0) return state;

  const withoutSource = state.openFileIds.filter((id) => id !== sourceFileId);
  const insertIndex = withoutSource.indexOf(targetFileId);
  return {
    openFileIds: [
      ...withoutSource.slice(0, insertIndex),
      sourceFileId,
      ...withoutSource.slice(insertIndex),
    ],
    activeFileId: state.activeFileId,
  };
}
