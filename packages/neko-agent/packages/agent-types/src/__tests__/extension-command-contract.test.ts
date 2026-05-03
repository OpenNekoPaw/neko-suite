import { describe, expect, it } from 'vitest';
import {
  NEKO_AGENT_LLM_GENERATE_COMMAND,
  NEKO_AGENT_REGISTER_CAPABILITIES_COMMAND,
  NEKO_AGENT_REGISTER_SLASH_COMMANDS_COMMAND,
  NEKO_AI_ASSISTANT_FOCUS_COMMAND,
  NEKO_MARKET_EXTENSION_ID,
  NEKO_MARKET_OPEN_SKILLS_COMMAND,
  NEKO_PUPPET_EXTENSION_ID,
  buildPluginSlashCommandCommand,
} from '../extension-command-contract';

describe('extension command contract', () => {
  it('keeps VSCode bridge command ids in a shared contract', () => {
    expect(NEKO_AI_ASSISTANT_FOCUS_COMMAND).toBe('neko.aiAssistant.focus');
    expect(NEKO_MARKET_EXTENSION_ID).toBe('neko.neko-market');
    expect(NEKO_MARKET_OPEN_SKILLS_COMMAND).toBe('neko.market.openSkills');
    expect(NEKO_AGENT_REGISTER_CAPABILITIES_COMMAND).toBe('neko.agent.registerCapabilities');
    expect(NEKO_AGENT_REGISTER_SLASH_COMMANDS_COMMAND).toBe('neko.agent.registerSlashCommands');
    expect(NEKO_AGENT_LLM_GENERATE_COMMAND).toBe('neko.agent.llm.generate');
    expect(NEKO_PUPPET_EXTENSION_ID).toBe('neko.neko-puppet');
  });

  it('builds plugin slash command ids without duplicating format in extension', () => {
    expect(
      buildPluginSlashCommandCommand({
        extensionId: 'neko.nekocanvas',
        commandId: 'batch',
      }),
    ).toBe('neko.nekocanvas.slashCommand.batch');
  });
});
