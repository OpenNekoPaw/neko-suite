import {
  TOOL_NAMES_SYSTEM,
  type AgentCapabilityContext,
  type AgentCapabilityProvider,
  type Tool,
  type ToolGroup,
} from '@neko/shared';
import { createSemanticCoverageTool } from './semanticCoverageTool';

export function createSemanticCoverageCapabilityProvider(): AgentCapabilityProvider {
  return new SemanticCoverageCapabilityProvider();
}

class SemanticCoverageCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-search-semantic-coverage';
  readonly version = '1.0.0';

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [createSemanticCoverageTool()];
  }

  getToolGroups(): ToolGroup[] {
    return [
      {
        name: 'semantic-coverage',
        description:
          'Semantic coverage querying tools for deciding whether cached OCR, ASR, subtitle, vision, or entity ranges can be reused',
        tools: [TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE],
        alwaysActive: true,
        priority: 100,
        loadingTier: 'resident',
        source: 'builtin',
        enabled: true,
        icon: 'search',
      },
    ];
  }
}
