/**
 * Canvas Ambient Context
 *
 * Stores the currently selected canvas nodes so that neko-agent can inject
 * them into the system prompt automatically (without the user having to @mention).
 *
 * Updated by subscribing to NekoCanvasAPI.nodes.onSelectionChange in index.ts.
 * Read by messageHandler when building the agent context per conversation.
 */

import type { CanvasNode } from '@neko/shared';

// =============================================================================
// In-memory state
// =============================================================================

interface SelectedNodeSummary {
  nodeId: string;
  type: string;
  summary: string;
}

let _selectedNodes: SelectedNodeSummary[] = [];

const MAX_AMBIENT_NODES = 5;

// =============================================================================
// Public API
// =============================================================================

/** Update the stored selection (called from onSelectionChange handler) */
export function setCanvasSelection(nodes: CanvasNode[]): void {
  _selectedNodes = nodes.slice(0, MAX_AMBIENT_NODES).map(summarizeNode);
}

/** Read the current selection for injection into agent context */
export function getCanvasSelection(): SelectedNodeSummary[] {
  return _selectedNodes;
}

/** Clear the selection (called when canvas editor closes) */
export function clearCanvasSelection(): void {
  _selectedNodes = [];
}

// =============================================================================
// Node summary helper
// =============================================================================

function summarizeNode(node: CanvasNode): SelectedNodeSummary {
  const type = node.type;
  let summary = `${type} #${node.id.slice(0, 6)}`;

  // Produce richer summaries for storyboard node types
  const data = node.data as Record<string, unknown>;

  switch (node.type) {
    case 'shot': {
      const shotNum = data['shotNumber'] ?? '?';
      const scale = data['shotScale'] ?? '';
      const desc =
        typeof data['visualDescription'] === 'string' ? data['visualDescription'].slice(0, 60) : '';
      summary = `#${shotNum} ${scale}${desc ? ` — ${desc}` : ''}`.trim();
      break;
    }
    case 'scene': {
      const title = typeof data['sceneTitle'] === 'string' ? data['sceneTitle'] : 'Scene';
      const num = data['sceneNumber'] ?? '';
      summary = `Scene ${num}: ${title}`.trim();
      break;
    }
    case 'gallery': {
      const name = typeof data['characterName'] === 'string' ? data['characterName'] : '';
      const preset = typeof data['preset'] === 'string' ? data['preset'] : '';
      summary = name ? `Gallery: ${name} (${preset})` : `Gallery (${preset})`;
      break;
    }
    case 'annotation': {
      const content = typeof data['content'] === 'string' ? data['content'].slice(0, 60) : '';
      summary = content ? `Note: ${content}` : 'Annotation';
      break;
    }
    case 'media': {
      const mediaType = data['mediaType'] ?? 'media';
      const assetPath =
        typeof data['assetPath'] === 'string' ? (data['assetPath'].split('/').pop() ?? '') : '';
      summary = assetPath ? `${mediaType}: ${assetPath}` : String(mediaType);
      break;
    }
    default:
      break;
  }

  return { nodeId: node.id, type, summary };
}
