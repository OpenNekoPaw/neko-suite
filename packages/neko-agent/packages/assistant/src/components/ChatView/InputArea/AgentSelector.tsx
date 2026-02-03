/**
 * AgentSelector Component
 */

import { useState, useRef } from 'react';
import { ConfiguredAgent } from '@/components/types';
import { useClickOutsideSingle } from './useClickOutside';
import { ChevronDownIcon } from './DropdownMenu';
import { useTranslation } from '@/i18n/I18nContext';

interface AgentSelectorProps {
  selectedAgentId: string | null;
  agents: ConfiguredAgent[];
  onSelect: (agentId: string) => void;
}

export function AgentSelector({ selectedAgentId, agents, onSelect }: AgentSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, () => setIsOpen(false));

  const enabledAgents = agents.filter(a => a.enabled !== false);
  const selectedAgent = enabledAgents.find(a => a.id === selectedAgentId) || enabledAgents[0];

  // Helper function to get translated agent display name
  const getAgentDisplayName = (agent: ConfiguredAgent): string => {
    if (agent.nameKey) {
      return t(`settings.${agent.nameKey}`);
    }
    return agent.name;
  };

  // Helper function to get translated agent description
  const getAgentDisplayDescription = (agent: ConfiguredAgent): string => {
    if (agent.descriptionKey) {
      return t(`settings.${agent.descriptionKey}`);
    }
    return agent.description;
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded transition-colors"
        title={t('chat.selectAgent')}
      >
        <span className="max-w-[80px] truncate">{selectedAgent ? getAgentDisplayName(selectedAgent) : t('chat.defaultAgent')}</span>
        <ChevronDownIcon />
      </button>

      {isOpen && enabledAgents.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded-md shadow-lg min-w-[200px] max-h-[300px] overflow-y-auto py-1 z-50">
          {enabledAgents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => {
                onSelect(agent.id);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors ${
                selectedAgentId === agent.id ? 'text-[var(--vscode-textLink-foreground)]' : ''
              }`}
            >
              <div className="truncate">{getAgentDisplayName(agent)}</div>
              <div className="text-[9px] text-[var(--vscode-descriptionForeground)] truncate">
                {getAgentDisplayDescription(agent)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
