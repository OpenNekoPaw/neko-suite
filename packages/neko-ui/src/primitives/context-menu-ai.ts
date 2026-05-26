import type { MenuItem } from './positioned-context-menu';

export interface AICapability {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

export interface AIMenuConfig {
  readonly quickActions?: readonly AICapability[];
  readonly agentActions?: readonly AICapability[];
  readonly onSendToAgent?: () => void;
  readonly sendToAgentLabel?: string;
}

const DEFAULT_AGENT_LABEL = '发送到 Agent';
const AGENT_ICON = '🤖';

export function buildAIMenuSection(config: AIMenuConfig): MenuItem[] {
  const { agentActions, onSendToAgent, quickActions, sendToAgentLabel } = config;
  const items: MenuItem[] = [];
  const hasQuick = quickActions !== undefined && quickActions.length > 0;
  const hasAgentSubmenu = agentActions !== undefined && agentActions.length > 0;
  const hasAgent = hasAgentSubmenu || onSendToAgent !== undefined;

  if (!hasQuick && !hasAgent) return items;

  items.push({ separator: true });

  if (hasQuick) {
    for (const action of quickActions) {
      items.push({
        label: action.label,
        icon: action.icon,
        shortcut: action.shortcut,
        disabled: action.disabled,
        onClick: action.onClick,
      });
    }
  }

  if (!hasAgent) return items;

  if (hasQuick) {
    items.push({ separator: true });
  }

  const label = sendToAgentLabel ?? DEFAULT_AGENT_LABEL;

  if (hasAgentSubmenu) {
    items.push({
      label,
      icon: AGENT_ICON,
      onClick: () => {},
      submenu: agentActions.map((action) => ({
        label: action.label,
        icon: action.icon,
        disabled: action.disabled,
        onClick: action.onClick,
      })),
    });
    return items;
  }

  if (onSendToAgent) {
    items.push({
      label,
      icon: AGENT_ICON,
      onClick: onSendToAgent,
    });
  }

  return items;
}
