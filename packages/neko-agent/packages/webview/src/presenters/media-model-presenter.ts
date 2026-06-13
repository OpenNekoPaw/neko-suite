import type { ChatModelOption } from '@neko/shared';
import type { MediaModelSelectionState, AgentMediaModelCategory } from '@neko-agent/types';
import type { SessionMode } from '@neko-agent/types';

export interface MediaModelPickerProjection {
  category: AgentMediaModelCategory;
  selectedId: string;
  models: ChatModelOption[];
  hasModels: boolean;
}

export interface GenerationParamsBarProjection extends MediaModelPickerProjection {
  isAgentMode: boolean;
  showCategorySelector: boolean;
  showInlineMediaModelPicker: boolean;
  hasGenerationContext: boolean;
  isExpanded: boolean;
  showManualCollapse: boolean;
}

export interface GenerationParamsBarContextChipLike {
  type: string;
}

export function projectSessionMediaModelPickerState(input: {
  sessionMode: SessionMode;
  mediaModelSelection: Readonly<MediaModelSelectionState>;
  availableMediaModels: readonly ChatModelOption[];
}): MediaModelPickerProjection | null {
  if (!isAgentMediaSessionMode(input.sessionMode)) {
    return null;
  }

  return projectMediaModelPicker({
    category: input.sessionMode,
    mediaModelSelection: input.mediaModelSelection,
    availableMediaModels: input.availableMediaModels,
  });
}

export function projectGenerationParamsBarState(input: {
  sessionMode: SessionMode;
  generationCategory: AgentMediaModelCategory;
  mediaModelSelection: Readonly<MediaModelSelectionState>;
  availableMediaModels: readonly ChatModelOption[];
  ambientNodeCount?: number;
  contextChips?: readonly GenerationParamsBarContextChipLike[];
  manuallyExpanded?: boolean;
}): GenerationParamsBarProjection {
  const isAgentMode = input.sessionMode === 'agent';
  const hasGenerationContext = hasGenerationParamsContext({
    ambientNodeCount: input.ambientNodeCount,
    contextChips: input.contextChips,
  });
  const manuallyExpanded = input.manuallyExpanded ?? false;
  const category = input.sessionMode === 'agent' ? input.generationCategory : input.sessionMode;
  const picker = projectMediaModelPicker({
    category,
    mediaModelSelection: input.mediaModelSelection,
    availableMediaModels: input.availableMediaModels,
  });

  return {
    ...picker,
    isAgentMode,
    showCategorySelector: isAgentMode,
    showInlineMediaModelPicker: isAgentMode,
    hasGenerationContext,
    isExpanded: !isAgentMode || hasGenerationContext || manuallyExpanded,
    showManualCollapse: isAgentMode && manuallyExpanded && !hasGenerationContext,
  };
}

function hasGenerationParamsContext(input: {
  ambientNodeCount?: number;
  contextChips?: readonly GenerationParamsBarContextChipLike[];
}): boolean {
  return (
    (input.ambientNodeCount ?? 0) > 0 ||
    (input.contextChips?.some((chip) => isGenerationParamsContextType(chip.type)) ?? false)
  );
}

function isAgentMediaSessionMode(sessionMode: SessionMode): sessionMode is AgentMediaModelCategory {
  return sessionMode === 'image' || sessionMode === 'video' || sessionMode === 'audio';
}

function isGenerationParamsContextType(type: string): boolean {
  return type === 'canvas-node' || type === 'cut-clip';
}

function projectMediaModelPicker(input: {
  category: AgentMediaModelCategory;
  mediaModelSelection: Readonly<MediaModelSelectionState>;
  availableMediaModels: readonly ChatModelOption[];
}): MediaModelPickerProjection {
  const models = input.availableMediaModels.filter((model) => model.category === input.category);
  return {
    category: input.category,
    selectedId: input.mediaModelSelection[input.category],
    models,
    hasModels: models.length > 0,
  };
}
