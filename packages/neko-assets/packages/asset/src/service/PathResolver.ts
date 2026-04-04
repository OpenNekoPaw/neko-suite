/**
 * Path Resolver Service — re-exported from @neko/shared.
 *
 * @neko/shared provides the core PathResolver (L0, zero dependencies).
 * This file re-exports it for backward compatibility within neko-assets.
 */
export {
  PathResolver,
  type PathVariableMap,
  type ResolvedPath,
  type MissingVariable,
} from '@neko/shared';
