// =============================================================================
// NKC Format SDK — Migrator
//
// Conservative, loss-preserving migrations for .nkc Canvas files.
// =============================================================================

import type { CanvasData, CanvasNode } from '../types/canvas';
import type { ContainerCapability } from '../types/canvas-layered';

export type NkcVersion = '1.0' | '2.0' | '2.1';

export const CURRENT_NKC_VERSION: NkcVersion = '2.1';

export interface NkcMigrationStep {
  from: string;
  to: string;
  description: string;
}

export interface NkcMigrationResult {
  data: CanvasData;
  fromVersion: string;
  toVersion: NkcVersion;
  migrated: boolean;
  steps: NkcMigrationStep[];
  warnings: string[];
}

export function detectNkcVersion(data: unknown): string | undefined {
  if (isRecord(data) && typeof data['version'] === 'string') {
    return data['version'];
  }

  return undefined;
}

export function migrateNkc(data: CanvasData): NkcMigrationResult {
  const fromVersion = detectNkcVersion(data) ?? '1.0';

  if (fromVersion === CURRENT_NKC_VERSION) {
    return {
      data,
      fromVersion,
      toVersion: CURRENT_NKC_VERSION,
      migrated: false,
      steps: [],
      warnings: [],
    };
  }

  const steps: NkcMigrationStep[] = [];
  let migrated: CanvasData = data;

  if (fromVersion === '2.0') {
    migrated = migrateNkcV2ToV2_1(migrated);
    steps.push({
      from: '2.0',
      to: '2.1',
      description: 'Normalized NKC v2.0 Canvas data to the v2.1 optional extension version.',
    });
  } else {
    migrated = migrateNkcV1ToV2(migrated);
    steps.push({
      from: fromVersion,
      to: '2.0',
      description:
        'Mirrored legacy Scene/Group/Shot containment into parentId and container.childIds.',
    });

    migrated = migrateNkcV2ToV2_1(migrated);
    steps.push({
      from: '2.0',
      to: '2.1',
      description: 'Normalized NKC v2.0 Canvas data to the v2.1 optional extension version.',
    });
  }

  return {
    data: migrated,
    fromVersion,
    toVersion: CURRENT_NKC_VERSION,
    migrated: true,
    steps,
    warnings:
      fromVersion === '1.0' || fromVersion === '2.0'
        ? []
        : [
            `Unknown NKC version "${fromVersion}" migrated with the v1-to-v2-to-v2.1 compatibility path.`,
          ],
  };
}

export function migrateNkcV1ToV2(data: CanvasData): CanvasData {
  const legacyParentByChildId = new Map<string, string>();

  for (const node of data.nodes) {
    for (const childId of getLegacyContainerChildIds(node)) {
      if (!legacyParentByChildId.has(childId)) {
        legacyParentByChildId.set(childId, node.id);
      }
    }
  }

  return {
    ...data,
    version: '2.0',
    nodes: data.nodes.map((node) => mirrorLegacyOrganization(node, legacyParentByChildId)),
    connections: data.connections.map((connection) => ({ ...connection })),
  };
}

export function migrateNkcV2ToV2_1(data: CanvasData): CanvasData {
  return {
    ...data,
    version: CURRENT_NKC_VERSION,
    nodes: data.nodes.map((node) => ({ ...node })),
    connections: data.connections.map((connection) => ({ ...connection })),
  };
}

function mirrorLegacyOrganization(
  node: CanvasNode,
  legacyParentByChildId: Map<string, string>,
): CanvasNode {
  const legacyChildIds = getLegacyContainerChildIds(node);
  const parentId = node.parentId ?? legacyParentByChildId.get(node.id);

  if (legacyChildIds.length === 0 && !parentId) {
    return { ...node };
  }

  const container =
    legacyChildIds.length > 0
      ? {
          ...(node.container ?? createContainerForNode(node)),
          policy: node.container?.policy ?? getDefaultPolicyForNode(node),
          childIds: uniqueStrings([...(node.container?.childIds ?? []), ...legacyChildIds]),
        }
      : node.container;

  const nextNode: CanvasNode = { ...node };

  if (parentId) {
    nextNode.parentId = parentId;
  }

  if (container) {
    nextNode.container = container;
  }

  return nextNode;
}

function createContainerForNode(node: CanvasNode): ContainerCapability {
  return {
    policy: getDefaultPolicyForNode(node),
    childIds: [],
  };
}

function getDefaultPolicyForNode(node: CanvasNode): ContainerCapability['policy'] {
  switch (node.type) {
    case 'scene':
      return 'scene';
    case 'group':
      return 'group';
    case 'artboard':
      return 'artboard';
    default:
      return 'group';
  }
}

function getLegacyContainerChildIds(node: CanvasNode): string[] {
  switch (node.type) {
    case 'group':
      return node.data.childIds;
    default:
      return [];
  }
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
