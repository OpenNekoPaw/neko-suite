import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { WorkspaceTrustLevel } from '@neko/shared';

const TRUST_STORE_VERSION = 1;

export interface WorkspaceTrustRecord {
  version: number;
  trustLevel: WorkspaceTrustLevel;
  workspaceFingerprint: string;
  workspaceUriHash: string;
  promotedAt: number;
  promotedBy?: string;
  reason?: string;
  source: 'created-locally' | 'user-promoted' | 'demoted' | 'blocked';
}

export interface WorkspaceTrustHint {
  trustLevel?: WorkspaceTrustLevel;
  createdByNeko?: boolean;
  exportedAt?: number;
  sourceKind?: string;
}

export interface WorkspaceTrustMigrationCandidate {
  fingerprint: string;
  hintedLevel: WorkspaceTrustLevel;
  requiresUserConfirmation: true;
  reason: string;
}

export interface WorkspaceTrustMigrationImportRequest {
  workspaceUri: string;
  confirmed: boolean;
  promotedBy?: string;
  reason?: string;
}

export class WorkspaceTrustStore {
  constructor(private readonly trustRoot: string) {}

  getRecordPath(fingerprint: string): string {
    return join(this.trustRoot, `${fingerprint}.json`);
  }

  fingerprintWorkspace(workspaceUri: string, projectMarker?: string): string {
    const hash = createHash('sha256');
    hash.update(workspaceUri);
    hash.update('\0');
    hash.update(projectMarker ?? '');
    return hash.digest('hex');
  }

  async get(fingerprint: string): Promise<WorkspaceTrustRecord | undefined> {
    try {
      const content = await readFile(this.getRecordPath(fingerprint), 'utf-8');
      return this.parseRecord(JSON.parse(content) as unknown, fingerprint);
    } catch {
      return undefined;
    }
  }

  async set(record: WorkspaceTrustRecord): Promise<void> {
    const filePath = this.getRecordPath(record.workspaceFingerprint);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8');
  }

  async promote(
    workspaceUri: string,
    promotedBy: string | undefined,
    reason?: string,
    projectMarker?: string,
  ): Promise<WorkspaceTrustRecord> {
    const workspaceFingerprint = this.fingerprintWorkspace(workspaceUri, projectMarker);
    const record: WorkspaceTrustRecord = {
      version: TRUST_STORE_VERSION,
      trustLevel: 'trusted',
      workspaceFingerprint,
      workspaceUriHash: hashValue(workspaceUri),
      promotedAt: Date.now(),
      promotedBy,
      reason,
      source: 'user-promoted',
    };
    await this.set(record);
    return record;
  }

  createMigrationCandidate(
    fingerprint: string,
    hint: WorkspaceTrustHint | undefined,
  ): WorkspaceTrustMigrationCandidate | undefined {
    if (hint?.trustLevel !== 'trusted') return undefined;
    return {
      fingerprint,
      hintedLevel: 'trusted',
      requiresUserConfirmation: true,
      reason: 'project-local trust hints are not authoritative and require user confirmation',
    };
  }

  async importMigrationCandidate(
    candidate: WorkspaceTrustMigrationCandidate,
    request: WorkspaceTrustMigrationImportRequest,
  ): Promise<WorkspaceTrustRecord | undefined> {
    if (!request.confirmed) return undefined;

    const record: WorkspaceTrustRecord = {
      version: TRUST_STORE_VERSION,
      trustLevel: candidate.hintedLevel,
      workspaceFingerprint: candidate.fingerprint,
      workspaceUriHash: hashValue(request.workspaceUri),
      promotedAt: Date.now(),
      promotedBy: request.promotedBy,
      reason: request.reason ?? candidate.reason,
      source: 'user-promoted',
    };
    await this.set(record);
    return record;
  }

  private parseRecord(
    value: unknown,
    expectedFingerprint: string,
  ): WorkspaceTrustRecord | undefined {
    if (!isRecord(value)) return undefined;
    if (value['version'] !== TRUST_STORE_VERSION) return undefined;
    if (!isWorkspaceTrustLevel(value['trustLevel'])) return undefined;
    if (value['workspaceFingerprint'] !== expectedFingerprint) return undefined;
    if (typeof value['workspaceUriHash'] !== 'string') return undefined;
    if (typeof value['promotedAt'] !== 'number') return undefined;
    if (!isRecordSource(value['source'])) return undefined;
    return {
      version: TRUST_STORE_VERSION,
      trustLevel: value['trustLevel'],
      workspaceFingerprint: value['workspaceFingerprint'],
      workspaceUriHash: value['workspaceUriHash'],
      promotedAt: value['promotedAt'],
      promotedBy: typeof value['promotedBy'] === 'string' ? value['promotedBy'] : undefined,
      reason: typeof value['reason'] === 'string' ? value['reason'] : undefined,
      source: value['source'],
    };
  }
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isWorkspaceTrustLevel(value: unknown): value is WorkspaceTrustLevel {
  return value === 'trusted' || value === 'restricted' || value === 'limited';
}

function isRecordSource(value: unknown): value is WorkspaceTrustRecord['source'] {
  return (
    value === 'created-locally' ||
    value === 'user-promoted' ||
    value === 'demoted' ||
    value === 'blocked'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
