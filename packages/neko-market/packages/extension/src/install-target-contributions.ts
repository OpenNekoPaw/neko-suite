import * as vscode from 'vscode';
import type {
  AssetManifest,
  AssetType,
  IInstallTarget,
  MissingInstallTargetContributor,
} from '@neko/shared';
import { InstallTargetRegistry } from '@neko/market-core';

export interface InstallTargetDiagnostic {
  level: 'error' | 'warning' | 'info';
  message: string;
  type?: AssetType;
  kind?: string;
  extensionId?: string;
}

export interface InstallTargetContributionDeclaration {
  type: AssetType;
  kind?: string;
  extensionId: string;
  activationEvent?: string;
}

export interface InstallTargetContributorExtension {
  id: string;
  isActive: boolean;
  packageJSON?: unknown;
  activate(): Promise<unknown> | unknown;
}

interface LiveInstallTargetRegistration {
  target: IInstallTarget;
  extensionId?: string;
  kind?: string;
  builtin?: boolean;
}

const BUILTIN_TYPES = new Set<AssetType>(['media', 'starter', 'preset', 'bundle']);

export class InstallTargetContributionRegistry implements vscode.Disposable {
  private readonly liveTargets = new Map<string, LiveInstallTargetRegistration>();
  private readonly declarations = new Map<string, InstallTargetContributionDeclaration>();
  private readonly diagnostics: InstallTargetDiagnostic[] = [];

  constructor(private readonly targets: InstallTargetRegistry) {}

  registerBuiltin(target: IInstallTarget): void {
    this.targets.register(target);
    this.liveTargets.set(routeKey(target.type), { target, builtin: true });
  }

  registerInstallTarget(
    target: IInstallTarget,
    extensionId?: string,
    kind?: string,
  ): vscode.Disposable {
    this.validateTarget(target, extensionId, kind);

    const key = routeKey(target.type, kind);
    if (this.liveTargets.has(key)) {
      const message = `Install target route already registered: ${key}`;
      this.addDiagnostic({ level: 'error', message, type: target.type, kind, extensionId });
      throw new Error(message);
    }

    this.targets.register(target, kind);
    this.liveTargets.set(key, { target, extensionId, kind });
    this.addDiagnostic({
      level: 'info',
      message: `Install target registered: ${key}`,
      type: target.type,
      kind,
      extensionId,
    });

    return {
      dispose: () => {
        const current = this.liveTargets.get(key);
        if (current?.target !== target) return;
        this.liveTargets.delete(key);
        this.rebuildCoreRegistry();
      },
    };
  }

  discover(extensions: readonly InstallTargetContributorExtension[]): void {
    this.declarations.clear();
    for (const extension of extensions) {
      for (const declaration of readInstallTargetDeclarations(extension)) {
        this.addDeclaration(declaration);
      }
    }
  }

  addDeclaration(declaration: InstallTargetContributionDeclaration): void {
    if (BUILTIN_TYPES.has(declaration.type) && !declaration.kind) {
      this.addDiagnostic({
        level: 'error',
        message: `Builtin install target cannot be overridden: ${declaration.type}`,
        type: declaration.type,
        kind: declaration.kind,
        extensionId: declaration.extensionId,
      });
      return;
    }

    const key = routeKey(declaration.type, declaration.kind);
    if (this.declarations.has(key)) {
      this.addDiagnostic({
        level: 'error',
        message: `Duplicate install target contribution: ${key}`,
        type: declaration.type,
        kind: declaration.kind,
        extensionId: declaration.extensionId,
      });
      return;
    }
    this.declarations.set(key, declaration);
  }

  resolveTarget(manifest: AssetManifest): IInstallTarget | undefined {
    const kind = getManifestKind(manifest);
    const kindTarget = kind
      ? this.liveTargets.get(routeKey(manifest.type, kind))?.target
      : undefined;
    return kindTarget ?? this.liveTargets.get(routeKey(manifest.type))?.target;
  }

  async ensureTarget(
    manifest: AssetManifest,
    getExtension: (extensionId: string) => InstallTargetContributorExtension | undefined,
  ): Promise<IInstallTarget> {
    const current = this.resolveTarget(manifest);
    if (current) return current;

    const declaration = this.resolveDeclaration(manifest);
    if (!declaration) {
      throw new Error(`No InstallTarget contribution for type: ${manifest.type}`);
    }

    const extension = getExtension(declaration.extensionId);
    if (!extension) {
      throw new Error(
        `InstallTarget contributor is not installed: ${declaration.extensionId} for ${manifest.type}`,
      );
    }

    try {
      if (!extension.isActive) {
        await extension.activate();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `InstallTarget contributor activation failed: ${declaration.extensionId} for ${manifest.type}: ${message}`,
      );
    }

    const live = this.resolveTarget(manifest);
    if (!live) {
      throw new Error(
        `InstallTarget contributor ${declaration.extensionId} did not register target for ${manifest.type}`,
      );
    }
    return live;
  }

  getMissingContributor(manifest: AssetManifest): MissingInstallTargetContributor | undefined {
    if (this.resolveTarget(manifest)) return undefined;
    const declaration = this.resolveDeclaration(manifest);
    const kind = getManifestKind(manifest);
    if (!declaration) {
      return {
        type: manifest.type,
        kind,
        reason: 'not-declared',
        message: `No InstallTarget contribution for type: ${manifest.type}`,
      };
    }
    return {
      type: manifest.type,
      kind,
      extensionId: declaration.extensionId,
      reason: 'not-registered',
      message: `InstallTarget contributor ${declaration.extensionId} is not active for ${manifest.type}`,
    };
  }

  getRegisteredTypes(): AssetType[] {
    return Array.from(
      new Set(
        Array.from(this.liveTargets.values()).map((registration) => registration.target.type),
      ),
    );
  }

  getDiagnostics(): InstallTargetDiagnostic[] {
    return [...this.diagnostics];
  }

  dispose(): void {
    this.liveTargets.clear();
    this.declarations.clear();
  }

  private validateTarget(
    target: IInstallTarget,
    extensionId: string | undefined,
    kind?: string,
  ): void {
    if (!target || typeof target.type !== 'string' || typeof target.getInstallPath !== 'function') {
      const message = 'Invalid install target: type and getInstallPath are required';
      this.addDiagnostic({ level: 'error', message, extensionId });
      throw new Error(message);
    }

    if (BUILTIN_TYPES.has(target.type) && !kind) {
      const message = `Builtin install target cannot be overridden: ${target.type}`;
      this.addDiagnostic({ level: 'error', message, type: target.type, kind, extensionId });
      throw new Error(message);
    }
  }

  private resolveDeclaration(
    manifest: AssetManifest,
  ): InstallTargetContributionDeclaration | undefined {
    const kind = getManifestKind(manifest);
    const kindDeclaration = kind ? this.declarations.get(routeKey(manifest.type, kind)) : undefined;
    return kindDeclaration ?? this.declarations.get(routeKey(manifest.type));
  }

  private rebuildCoreRegistry(): void {
    this.targets.clear();
    for (const registration of this.liveTargets.values()) {
      this.targets.register(registration.target, registration.kind);
    }
  }

  private addDiagnostic(diagnostic: InstallTargetDiagnostic): void {
    this.diagnostics.push(diagnostic);
  }
}

function readInstallTargetDeclarations(
  extension: InstallTargetContributorExtension,
): InstallTargetContributionDeclaration[] {
  const raw = getNestedRecord(extension.packageJSON, ['contributes', 'neko.installTargets']);
  if (!Array.isArray(raw)) return [];

  const declarations: InstallTargetContributionDeclaration[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry['type'] !== 'string') continue;
    declarations.push({
      type: entry['type'] as AssetType,
      kind: typeof entry['kind'] === 'string' ? entry['kind'] : undefined,
      extensionId: extension.id,
      activationEvent:
        typeof entry['activationEvent'] === 'string'
          ? entry['activationEvent']
          : defaultActivationEvent(entry['type'], entry['kind']),
    });
  }
  return declarations;
}

function getNestedRecord(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function defaultActivationEvent(type: unknown, kind: unknown): string | undefined {
  if (typeof type !== 'string') return undefined;
  if (typeof kind === 'string') return `onInstallKind:${type}.${kind}`;
  return `onInstallType:${type}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function routeKey(type: AssetType, kind?: string): string {
  return kind ? `${type}.${kind}` : type;
}

function getManifestKind(manifest: AssetManifest): string | undefined {
  const metadata = manifest.typeMetadata;
  if (!metadata) return undefined;
  switch (metadata.type) {
    case 'media':
      return metadata.data.mediaKind;
    case 'model':
      return metadata.data.modelKind;
    case 'shader':
      return metadata.data.shaderKind;
    case 'preset':
      return metadata.data.presetKind;
    case 'identity':
      return metadata.data.identityKind;
    default:
      return undefined;
  }
}
