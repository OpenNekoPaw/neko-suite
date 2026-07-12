import { existsSync, readdirSync, realpathSync } from 'fs';
import { dirname, resolve } from 'path';

/**
 * Resolve a dependency exactly as installed for the importing package.
 *
 * pnpm may install multiple versions of the same dependency in its root store,
 * so selecting a store entry by directory-name ordering is not a valid module
 * resolution strategy. Walking ancestor node_modules directories follows the
 * symlinks pnpm created for the importer and preserves the dependency graph.
 */
export function findInstalledPackageRoot(
  packageName: string,
  startDirectory: string,
): string | undefined {
  let current = existsSync(startDirectory) ? realpathSync(startDirectory) : startDirectory;
  while (true) {
    const packageRoot = resolve(current, 'node_modules', packageName);
    if (existsSync(resolve(packageRoot, 'package.json'))) return packageRoot;

    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/**
 * Last-resort resolution for packages not reachable through an importer.
 * Ambiguity is a build error rather than silently binding the executable to an
 * unrelated package version or peer-dependency variant.
 */
export function findUnambiguousPnpmPackageRoot(
  packageName: string,
  pnpmStore: string,
): string | undefined {
  if (!existsSync(pnpmStore)) return undefined;

  const escapedName = packageName.replace('/', '+');
  const packageRoots = readdirSync(pnpmStore)
    .filter((entry) => entry === packageName || entry.startsWith(`${escapedName}@`))
    .map((entry) => resolve(pnpmStore, entry, 'node_modules', packageName))
    .filter((packageRoot) => existsSync(resolve(packageRoot, 'package.json')));

  if (packageRoots.length === 0) return undefined;
  if (packageRoots.length === 1) return packageRoots[0];

  throw new Error(
    `Ambiguous pnpm package resolution for "${packageName}". ` +
      `The importer must expose its installed dependency through node_modules. ` +
      `Candidates: ${packageRoots.join(', ')}`,
  );
}
