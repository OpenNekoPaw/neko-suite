export { ProjectCacheSearchService } from './ProjectCacheSearchService';
export { ProjectIndexCoordinator } from './ProjectIndexCoordinator';
export {
  buildProjectSearchText,
  matchesProjectSearchItem,
  normalizeProjectSearchQuery,
  normalizeSearchText,
  projectSearchItemMatchesFilters,
  rankProjectSearchItems,
} from './normalization';
export {
  DebouncedProjectCacheWriter,
  readProjectSearchCacheManifest,
  writeProjectSearchCacheManifest,
} from './cacheManifest';
export {
  projectSearchItemToGlobalSearchItem,
  projectSearchResultToGlobalSearchResult,
  toProjectGlobalSearchQuery,
  type ProjectGlobalSearchItem,
  type ProjectGlobalSearchQuery,
  type ProjectGlobalSearchResult,
} from './projections';
export { SimpleEventEmitter } from './simpleEventEmitter';
export type {
  ProjectSearchContextResolver,
  ProjectSearchDisposable,
  ProjectSearchEvent,
  ProjectSearchLogger,
  ProjectSearchRuntimePorts,
} from './ports';
