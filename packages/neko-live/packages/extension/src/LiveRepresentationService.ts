import type {
  CreativeEntity,
  NekoAssetsAPI,
  RepresentationResolveResult,
  ResolvedAssetRef,
} from '@neko/shared';
import { DefaultAssetRefResolver, RepresentationResolver } from '@neko/entity/core';
import { createVSCodeEntityServices } from '@neko/entity/host-vscode';

export interface LiveRepresentationServiceDeps {
  readonly workspaceRoot: string;
  readonly getAssetsApi?: () => NekoAssetsAPI | undefined;
}

export interface LiveRepresentationResolvedAvatar {
  readonly status: 'resolved';
  readonly entityId: string;
  readonly assetRef: string;
  readonly assetEntityId?: string;
  readonly avatarPath?: string;
  readonly avatarUri?: string;
  readonly avatarType: 'vrm' | 'puppet';
  readonly result: Extract<RepresentationResolveResult, { status: 'resolved' }>;
}

export interface LiveRepresentationMissingAvatar {
  readonly status: 'missing-representation';
  readonly entityId: string;
  readonly missingKinds: readonly string[];
  readonly suggestedActions: readonly string[];
}

export type LiveRepresentationAvatarResult =
  | LiveRepresentationResolvedAvatar
  | LiveRepresentationMissingAvatar;

export class LiveRepresentationService {
  private readonly registry: ReturnType<typeof createVSCodeEntityServices>['registry'];
  private readonly resolver: RepresentationResolver;

  constructor(private readonly deps: LiveRepresentationServiceDeps) {
    const entityServices = createVSCodeEntityServices({ projectRoot: deps.workspaceRoot });
    this.registry = entityServices.registry;
    this.resolver = new RepresentationResolver({
      entities: this.registry,
      bindings: entityServices.bindings,
      assetRefs: new DefaultAssetRefResolver({
        project: async (parsed) => {
          const assetId =
            parsed.authority === 'assets' && parsed.path
              ? parsed.path
              : parsed.path.startsWith('assets/')
                ? parsed.path.slice('assets/'.length)
                : parsed.authority;
          return {
            source: 'project',
            readonly: false,
            ...(assetId ? { assetEntityId: decodeURIComponent(assetId) } : {}),
          };
        },
        market: async () => ({ source: 'market', readonly: true }),
        shared: async () => ({ source: 'shared', readonly: true }),
        external: async () => ({ source: 'external', readonly: true }),
      }),
      federation: {
        describeAsset: async (ref) => this.describeAsset(ref),
      },
    });
  }

  async listCharacters(): Promise<readonly CreativeEntity[]> {
    return this.registry.list({ kind: 'character' });
  }

  async resolveAvatar(entityId: string): Promise<LiveRepresentationAvatarResult> {
    const result = await this.resolver.resolve({
      entityId,
      target: 'live',
      fallbackOrder: ['live3d', 'live2d'],
    });

    if (result.status === 'missing-representation') {
      return {
        status: 'missing-representation',
        entityId,
        missingKinds: result.missingKinds,
        suggestedActions: result.suggestedActions,
      };
    }

    const mainFile = result.files.find((file) => file.role === 'main' || file.role === 'model');
    return {
      status: 'resolved',
      entityId,
      assetRef: result.assetRef,
      assetEntityId: result.assetEntityId,
      avatarPath: mainFile?.path,
      avatarUri: mainFile?.assetRef,
      avatarType: result.resolvedKind === 'live2d' ? 'puppet' : 'vrm',
      result,
    };
  }

  private async describeAsset(ref: ResolvedAssetRef) {
    if (!ref.assetEntityId) {
      return undefined;
    }

    const detail = await this.deps
      .getAssetsApi?.()
      ?.getRepresentationPackageDetail(ref.assetEntityId);
    if (!detail) {
      return undefined;
    }

    return {
      capabilities: detail.capabilities,
      files: detail.files,
      metadata: {
        representationKinds: detail.representationKinds,
        missingRoles: detail.missingRoles,
      },
    };
  }
}
