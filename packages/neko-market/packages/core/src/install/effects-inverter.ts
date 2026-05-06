import { rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { AssetManifest } from '@neko/shared';

export interface EffectsRegistryAdapter {
  registerTool?(id: string): Promise<void> | void;
  unregisterTool?(id: string): Promise<void> | void;
  registerProvider?(id: string): Promise<void> | void;
  unregisterProvider?(id: string): Promise<void> | void;
  registerRuntime?(id: string): Promise<void> | void;
  unregisterRuntime?(id: string): Promise<void> | void;
  registerEffect?(id: string): Promise<void> | void;
  unregisterEffect?(id: string): Promise<void> | void;
  registerCommand?(id: string): Promise<void> | void;
  unregisterCommand?(id: string): Promise<void> | void;
  removeFile?(path: string): Promise<void> | void;
}

export interface EffectsInversionContext {
  installedPath?: string;
}

export class EffectsActivator {
  constructor(private readonly adapter: EffectsRegistryAdapter = {}) {}

  async activate(manifest: AssetManifest): Promise<void> {
    const registrations = manifest.effects?.registrations;
    if (!registrations) return;

    await this.applyMany(registrations.tools, this.adapter.registerTool);
    await this.applyMany(registrations.providers, this.adapter.registerProvider);
    await this.applyMany(registrations.runtimes, this.adapter.registerRuntime);
    await this.applyMany(registrations.effects, this.adapter.registerEffect);
    await this.applyMany(registrations.commands, this.adapter.registerCommand);
  }

  private async applyMany(
    values: readonly string[] | undefined,
    register: ((id: string) => Promise<void> | void) | undefined,
  ): Promise<void> {
    if (!values || !register) return;
    for (const value of values) {
      await register.call(this.adapter, value);
    }
  }
}

export class EffectsInverter {
  constructor(private readonly adapter: EffectsRegistryAdapter = {}) {}

  async invert(manifest: AssetManifest, context: EffectsInversionContext = {}): Promise<void> {
    const registrations = manifest.effects?.registrations;
    if (registrations) {
      await this.unregisterMany(registrations.tools, this.adapter.unregisterTool);
      await this.unregisterMany(registrations.providers, this.adapter.unregisterProvider);
      await this.unregisterMany(registrations.runtimes, this.adapter.unregisterRuntime);
      await this.unregisterMany(registrations.effects, this.adapter.unregisterEffect);
      await this.unregisterMany(registrations.commands, this.adapter.unregisterCommand);
    }

    await this.removeMany(manifest.effects?.files?.writes, context);
  }

  private async unregisterMany(
    values: readonly string[] | undefined,
    unregister: ((id: string) => Promise<void> | void) | undefined,
  ): Promise<void> {
    if (!values || !unregister) return;
    for (const value of values) {
      await unregister.call(this.adapter, value);
    }
  }

  private async removeMany(
    paths: readonly string[] | undefined,
    context: EffectsInversionContext,
  ): Promise<void> {
    if (!paths) return;
    for (const path of paths) {
      const targetPath = resolveEffectWritePath(
        path,
        context.installedPath,
        !!this.adapter.removeFile,
      );
      if (!targetPath) continue;
      if (this.adapter.removeFile) {
        await this.adapter.removeFile.call(this.adapter, targetPath);
      } else {
        await rm(targetPath, { recursive: true, force: true });
      }
    }
  }
}

function resolveEffectWritePath(
  effectPath: string,
  installedPath: string | undefined,
  hasAdapter: boolean,
): string | undefined {
  if (isAbsolute(effectPath)) {
    if (hasAdapter) return effectPath;
    throw new Error('effects.files.writes must be relative when no file adapter is configured');
  }
  if (!installedPath) return hasAdapter ? effectPath : undefined;

  const base = resolve(installedPath);
  const targetPath = resolve(base, effectPath);
  const rel = relative(base, targetPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`effects.files.writes escapes installed path: ${effectPath}`);
  }
  return targetPath;
}
