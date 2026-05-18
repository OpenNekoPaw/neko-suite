// TODO(P2): Remove this Agent compatibility shim after internal imports move to @neko/search.
export {
  PROJECT_SEARCH_QUERY_COMMAND,
  PROJECT_SEARCH_REFRESH_COMMAND,
  registerProjectSearchService,
  registerProjectSearchWatchers,
} from '@neko/search/host-vscode';
