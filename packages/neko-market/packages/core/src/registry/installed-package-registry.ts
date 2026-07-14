import type { InstalledPackage, InstalledPackageRefState } from '@neko/shared';

export interface RemovedReferenceState {
  packageId: string;
  previous: InstalledPackageRefState;
  next?: InstalledPackageRefState;
}

export interface InstalledPackageRegistry {
  load(): Promise<void>;
  ready(): Promise<void>;
  add(pkg: InstalledPackage): Promise<void>;
  setRequested(packageId: string, requested: boolean): Promise<void>;
  update(
    packageId: string,
    updater: (pkg: InstalledPackage) => InstalledPackage,
  ): Promise<InstalledPackage | undefined>;
  setEnabled(packageId: string, enabled: boolean): Promise<void>;
  remove(packageId: string): Promise<void>;
  addReference(packageId: string, ownerPackageId: string): Promise<InstalledPackageRefState>;
  removeReference(
    packageId: string,
    ownerPackageId: string,
  ): Promise<InstalledPackageRefState | undefined>;
  removeOwnerReferences(
    ownerPackageId: string,
    packageIds?: readonly string[],
  ): Promise<RemovedReferenceState[]>;
  getReference(packageId: string): InstalledPackageRefState | undefined;
  get(packageId: string): InstalledPackage | undefined;
  list(): InstalledPackage[];
  has(packageId: string): boolean;
}
