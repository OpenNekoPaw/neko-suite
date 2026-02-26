/**
 * Session Storage
 *
 * File-based session persistence for CLI interactive mode.
 * Stores conversation history to ~/.neko/sessions/
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ChatMessage } from '@neko/shared';

export interface SessionInfo {
  id: string;
  timestamp: number;
  messageCount: number;
  preview: string;
}

interface StoredSession {
  id: string;
  timestamp: number;
  messages: ChatMessage[];
}

const DEFAULT_STORAGE_DIR = path.join(os.homedir(), '.neko', 'sessions');
const MAX_SESSIONS = 50;

export class FileSessionStorage {
  private storageDir: string;

  constructor(storageDir?: string) {
    this.storageDir = storageDir ?? DEFAULT_STORAGE_DIR;
  }

  async save(id: string, history: ChatMessage[]): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });

    const session: StoredSession = {
      id,
      timestamp: Date.now(),
      messages: history,
    };

    const filePath = path.join(this.storageDir, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');

    // Prune old sessions
    await this.pruneOldSessions();
  }

  async load(id: string): Promise<ChatMessage[] | null> {
    const filePath = path.join(this.storageDir, `${id}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const session = JSON.parse(content) as StoredSession;
      return session.messages;
    } catch {
      return null;
    }
  }

  async list(): Promise<SessionInfo[]> {
    try {
      const files = await fs.readdir(this.storageDir);
      const sessions: SessionInfo[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const filePath = path.join(this.storageDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const session = JSON.parse(content) as StoredSession;
          const firstUserMsg = session.messages.find((m) => m.role === 'user');
          sessions.push({
            id: session.id,
            timestamp: session.timestamp,
            messageCount: session.messages.length,
            preview: firstUserMsg
              ? String(firstUserMsg.content).slice(0, 80)
              : '(empty)',
          });
        } catch {
          // Skip corrupted files
        }
      }

      return sessions.sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  }

  async getLatest(): Promise<string | null> {
    const sessions = await this.list();
    return sessions[0]?.id ?? null;
  }

  private async pruneOldSessions(): Promise<void> {
    const sessions = await this.list();
    if (sessions.length <= MAX_SESSIONS) return;

    const toDelete = sessions.slice(MAX_SESSIONS);
    for (const session of toDelete) {
      try {
        await fs.unlink(path.join(this.storageDir, `${session.id}.json`));
      } catch {
        // Ignore deletion errors
      }
    }
  }
}

export function createSessionStorage(storageDir?: string): FileSessionStorage {
  return new FileSessionStorage(storageDir);
}
