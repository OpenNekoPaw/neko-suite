export { ProjectCacheSearchService } from './ProjectCacheSearchService';
export { ProjectIndexCoordinator } from './ProjectIndexCoordinator';
export {
  buildProjectSearchText,
  matchesProjectSearchItem,
  normalizeProjectSearchQuery,
  normalizeSearchText,
  rankProjectSearchItems,
} from './normalization';
export { resolveProjectSearchContext } from './projectResolver';
export {
  DebouncedProjectCacheWriter,
  readProjectSearchCacheManifest,
  writeProjectSearchCacheManifest,
} from './cacheManifest';
