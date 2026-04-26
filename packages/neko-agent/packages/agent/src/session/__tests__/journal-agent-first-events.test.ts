import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../types';
import { JournalWriter, type JournalFsOps } from '../journal-writer';

class MemoryFs implements JournalFsOps {
  readonly lines: string[] = [];
  async appendFile(_path: string, data: string): Promise<void> {
    this.lines.push(data);
  }
  async mkdir(): Promise<void> {}
}

describe('JournalWriter agent-first events', () => {
  it('serializes agent observation events as first-class Journal events', async () => {
    const fsOps = new MemoryFs();
    const writer = new JournalWriter({ filePath: '/tmp/session.jsonl', fsOps });
    const event: AgentEvent = {
      type: 'agent.observation.created',
      agentObservation: {
        id: 'obs-1',
        modality: 'image',
        summary: 'A blue-haired character.',
        confidence: 'high',
        evidenceIds: [],
        createdAt: 1,
      },
    };

    await writer.appendEvent(1, event);

    const parsed = JSON.parse(fsOps.lines[0]!.trim());
    expect(parsed.type).toBe('event');
    expect(parsed.event.type).toBe('agent.observation.created');
    expect(parsed.event.agentObservation.id).toBe('obs-1');
  });
});
