import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(packageRoot, relativePath), 'utf8');
}

function readInterface(source: string, name: string): string {
  const start = source.indexOf(`export interface ${name}`);
  if (start < 0) {
    throw new Error(`Missing interface ${name}`);
  }
  const nextExport = source.indexOf('\nexport ', start + 1);
  return source.slice(start, nextExport < 0 ? source.length : nextExport);
}

describe('scoped Agent child-run control paths', () => {
  it('keeps Task control APIs on complete TaskRunScope identities', () => {
    const taskManager = readInterface(read('../neko-types/src/types/task.ts'), 'ITaskManager');

    for (const operation of ['get', 'cancel', 'delete', 'waitForCompletion', 'onProgress']) {
      expect(taskManager).toMatch(new RegExp(`${operation}\\(scope: TaskRunScope`));
    }
    expect(taskManager).not.toMatch(/\btaskId\s*:\s*string/);
    expect(taskManager).not.toMatch(/\bidOrScope\b/);
  });

  it('keeps SubAgent control APIs on child or conversation run scopes', () => {
    const sharedAgentContracts = read('../neko-types/src/types/agent.ts');
    const subAgentManager = readInterface(
      read('packages/agent/src/subagent/types.ts'),
      'ISubAgentManager',
    );

    expect(sharedAgentContracts).not.toMatch(/terminate\(agentId:\s*string\)/);
    expect(sharedAgentContracts).not.toMatch(/terminateAll\(\)/);
    expect(sharedAgentContracts).not.toMatch(/readonly subAgents:\s*ISubAgentManager/);
    expect(subAgentManager).toMatch(/cancel\(scope:\s*ChildRunScope\)/);
    expect(subAgentManager).toMatch(/cancelRun\(scope:\s*ConversationRunScope\)/);
    expect(subAgentManager).not.toMatch(/terminate|\bsubAgentId\s*:\s*string/);
  });

  it('keeps Task result ownership authoritative in task.scope rather than lifecycle metadata', () => {
    const source = read('packages/agent/src/task/task-result-observation.ts');

    expect(source).toContain('const taskScope = requireTaskOwnerScope(task);');
    expect(source).not.toContain('extractTaskRunLease');
    expect(source).not.toMatch(/lifecycle\?\.ownerConversationId/);
    expect(source).not.toMatch(/lifecycle\?\.ownerRunId(?!StartedAt)/);
  });

  it('keeps terminal delivery and interruption control on authoritative Task scopes', () => {
    const taskManager = read('packages/agent/src/task/task-manager.ts');
    const observationRuntime = read('packages/agent/src/task/task-result-observation-runtime.ts');
    const lifecycleCoordinator = read(
      'packages/extension/src/services/taskLifecycleCoordinator.ts',
    );

    expect(taskManager).not.toContain('Skipping terminal task observer event without run lease');
    expect(observationRuntime).toContain('hasSameTaskOwnerScope(item.scope, task.scope)');
    expect(observationRuntime).not.toMatch(/task\.lifecycle\?\.ownerConversationId/);
    expect(observationRuntime).not.toMatch(/task\.lifecycle\?\.ownerRunId/);
    expect(lifecycleCoordinator).toContain('task.scope.conversationId !== event.conversationId');
    expect(lifecycleCoordinator).not.toMatch(/lifecycle\.ownerConversationId/);
    expect(lifecycleCoordinator).not.toMatch(/cancelConversation\??\(conversationId/);
  });

  it('keeps Webview Task actions scoped and removes the bare SubAgent journal path helper', () => {
    const protocol = readInterface(
      read('packages/agent-types/src/webview-protocol.ts'),
      'TaskActionWebviewMessage',
    );
    const journalStorage = read('packages/agent/src/session/journal-storage.ts');

    expect(protocol).toContain('taskScope: TaskRunScope');
    expect(protocol).not.toMatch(/\btaskId\s*:/);
    expect(protocol).not.toMatch(/\bconversationId\s*:/);
    expect(journalStorage).not.toContain('getSubAgentJournalPath');
  });
});
