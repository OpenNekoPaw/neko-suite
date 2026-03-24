/**
 * InstalledRegistry — Local persistence of installed packages.
 *
 * Manages `~/.neko/market-installed.json` as the source of truth
 * for what marketplace packages are currently installed.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { InstalledPackage, InstalledRegistryData } from '@neko/shared/types/asset/market';

// =============================================================================
// Constants
// =============================================================================

const REGISTRY_VERSION = 1;

// =============================================================================
// Implementation
// =============================================================================

export class InstalledRegistry {
  private data: InstalledRegistryData | undefined;

  constructor(private readonly filePath: string) {}

  /** Load the registry from disk */
  async load(): Promise<void> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      this.data = JSON.parse(content) as InstalledRegistryData;
    } catch {
      this.data = { version: REGISTRY_VERSION, packages: {} };
    }
  }

  /** Save the registry to disk */
  async save(): Promise<void> {
    this.ensureLoaded();
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  /** Add or update an installed package record */
  async add(pkg: InstalledPackage): Promise<void> {
    this.ensureLoaded();
    this.data!.packages[pkg.packageId] = pkg;
    await this.save();
  }

  /** Remove an installed package record */
  async remove(packageId: string): Promise<void> {
    this.ensureLoaded();
    delete this.data!.packages[packageId];
    await this.save();
  }

  /** Get a single installed package */
  get(packageId: string): InstalledPackage | undefined {
    this.ensureLoaded();
    return this.data!.packages[packageId];
  }

  /** List all installed packages */
  list(): InstalledPackage[] {
    this.ensureLoaded();
    return Object.values(this.data!.packages);
  }

  /** Check if a package is installed */
  has(packageId: string): boolean {
    this.ensureLoaded();
    return packageId in this.data!.packages;
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private ensureLoaded(): void {
    if (!this.data) {
      this.data = { version: REGISTRY_VERSION, packages: {} };
    }
  }
}
