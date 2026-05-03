import type { OpenTab, TabState } from './ui';

export interface ResolveActiveTabConversationIdInput {
  readonly tabState: TabState;
  readonly hasConversation: (conversationId: string) => boolean;
}

export interface ProjectTabStateUpdateInput {
  readonly openTabs: readonly OpenTab[];
  readonly activeTabId: string | null;
}

export const EMPTY_TAB_STATE: TabState = {
  openTabs: [],
  activeTabId: null,
};

export function normalizeTabState(value: unknown): TabState {
  const record = asRecord(value);
  if (!record) return { ...EMPTY_TAB_STATE };

  const openTabs = Array.isArray(record.openTabs)
    ? record.openTabs.filter(isOpenTab).map(cloneOpenTab)
    : [];
  const activeTabIdValue = record.activeTabId;
  const activeTabId = typeof activeTabIdValue === 'string' ? activeTabIdValue : null;

  return { openTabs, activeTabId };
}

export function projectTabStateUpdate(input: ProjectTabStateUpdateInput): TabState {
  return {
    openTabs: input.openTabs.map(cloneOpenTab),
    activeTabId: input.activeTabId,
  };
}

export function resolveActiveTabConversationId(
  input: ResolveActiveTabConversationIdInput,
): string | null {
  const activeTab = input.tabState.activeTabId
    ? input.tabState.openTabs.find((tab) => tab.id === input.tabState.activeTabId)
    : undefined;

  if (!activeTab) return null;
  return input.hasConversation(activeTab.conversationId) ? activeTab.conversationId : null;
}

function isOpenTab(value: unknown): value is OpenTab {
  const record = asRecord(value);
  return (
    !!record &&
    typeof record.id === 'string' &&
    typeof record.title === 'string' &&
    typeof record.conversationId === 'string'
  );
}

function cloneOpenTab(tab: OpenTab): OpenTab {
  return {
    id: tab.id,
    title: tab.title,
    conversationId: tab.conversationId,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}
