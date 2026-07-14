import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createNodeJournalStorage } from '@neko/agent';
import type { SerializableTask, TaskRecoveryInfo, TaskRunScope } from '@neko/shared';
import { createTuiSqliteConversationStorage } from '../../../apps/neko-tui/src/tui/host/tui-sqlite-conversation-storage';

const homedir = process.env['NEKO_SQLITE_TEST_HOME'];
const workDir = process.env['NEKO_SQLITE_TEST_WORKSPACE'];
const skillFile = process.env['NEKO_SQLITE_TEST_SKILL_FILE'];
if (!homedir) throw new Error('NEKO_SQLITE_TEST_HOME is required');
if (!workDir) throw new Error('NEKO_SQLITE_TEST_WORKSPACE is required');
if (!skillFile) throw new Error('NEKO_SQLITE_TEST_SKILL_FILE is required');

const binding = await createTuiSqliteConversationStorage({ homedir, workDir });
try {
  const listed = await binding.storage.list();
  if (listed.length !== 1 || listed[0]?.id !== 'extension-conversation') {
    throw new Error('Bun TUI list did not return the Extension conversation');
  }
  const searched = await binding.storage.search('Extension to Bun');
  if (searched.length !== 1 || searched[0]?.title !== 'Extension to Bun catalog') {
    throw new Error('Bun TUI search did not return the Extension conversation');
  }
  const resumed = await binding.storage.load('extension-conversation');
  if (
    resumed?.messages[0]?.role !== 'user' ||
    resumed.messages[0].content !== 'Can Bun resume this Extension conversation?'
  ) {
    throw new Error('Bun TUI resume did not project authoritative Extension Journal history');
  }
  const extensionTaskScope = taskScope('extension-task', 'extension-task-conversation');
  const extensionTask = await binding.taskStorage.load(extensionTaskScope);
  if (extensionTask?.id !== 'extension-task' || extensionTask.status !== 'running') {
    throw new Error('Bun TUI could not read the Extension Task through shared SQLite state');
  }
  const extensionCheckpoint = await binding.taskRecoveryStorage.load(extensionTaskScope);
  if (extensionCheckpoint?.externalTaskId !== 'provider-extension-task') {
    throw new Error('Bun TUI could not read the Extension Task checkpoint');
  }
  const catalogPartition = {
    scope: 'workspace' as const,
    workspaceId: binding.workspaceId,
    domain: 'catalog',
  };
  const extensionCatalog = await binding.catalogItems.list({ partition: catalogPartition });
  if (
    extensionCatalog.length !== 1 ||
    extensionCatalog[0]?.fingerprint !== 'sha256:catalog-parity-v1' ||
    extensionCatalog[0]?.diagnosticCodes[0] !== 'provider-not-configured:test-image-provider'
  ) {
    throw new Error('Bun TUI could not read the Extension catalog provider diagnostic');
  }

  await writeFile(
    skillFile,
    '---\nname: catalog-parity\ndescription: Catalog parity v2\n---\n\nVersion two.\n',
    'utf8',
  );
  await binding.catalogItems.replaceSlice({
    partition: catalogPartition,
    kind: 'skill',
    source: 'project',
    items: [
      {
        catalogId: 'project-agent-skills:catalog-parity',
        kind: 'skill',
        source: 'project',
        name: 'catalog-parity',
        displayName: 'Catalog parity',
        description: 'Catalog parity v2',
        version: null,
        rootId: 'project-agent-skills',
        relativePath: 'catalog-parity',
        fingerprint: 'sha256:catalog-parity-v2',
        enabled: true,
        diagnosticCodes: [],
        updatedAt: '2026-07-13T09:01:00.000Z',
      },
    ],
    updatedAt: '2026-07-13T09:01:00.000Z',
  });

  const journalWriter = createNodeJournalStorage(join(homedir, '.neko', 'journals')).createWriter(
    'tui-conversation',
  );
  await journalWriter.appendEvent(1, {
    type: 'user_message',
    content: 'Can Extension resume this TUI conversation?',
  });
  await journalWriter.appendEvent(2, {
    type: 'text',
    content: 'Yes, through the shared catalog.',
  });
  await journalWriter.flush();
  await binding.storage.save({
    id: 'tui-conversation',
    version: 2,
    title: 'Bun to Extension catalog',
    workDir,
    messages: [
      { role: 'user', content: 'Can Extension resume this TUI conversation?' },
      { role: 'assistant', content: 'Yes, through the shared catalog.' },
    ],
    createdAt: 1_752_372_000_000,
    updatedAt: 1_752_375_600_000,
    source: 'tui',
  });
  const tuiTask = createTask('tui-task', 'tui-task-conversation');
  await binding.taskStorage.save(tuiTask);
  await binding.taskRecoveryStorage.save(createCheckpoint(tuiTask));
} finally {
  await binding.dispose();
}

function createTask(id: string, conversationId: string): SerializableTask {
  return {
    scope: taskScope(id, conversationId),
    id,
    type: 'custom',
    status: 'running',
    input: { type: 'custom', payload: { id } },
    progress: 50,
    createdAt: 1_752_372_000_000,
    updatedAt: 1_752_375_600_000,
  };
}

function createCheckpoint(task: SerializableTask): TaskRecoveryInfo {
  return {
    scope: task.scope,
    taskId: task.id,
    externalTaskId: `provider-${task.id}`,
    providerId: 'cross-host-provider',
    taskType: 'custom',
    payload: { id: task.id },
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function taskScope(childRunId: string, conversationId: string): TaskRunScope {
  const runId = `run-${conversationId}`;
  return {
    conversationId,
    runId,
    parentRunId: runId,
    childRunId,
    childKind: 'task',
  };
}
