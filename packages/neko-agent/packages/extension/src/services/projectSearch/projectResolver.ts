import { resolveDocumentPath } from '../documentPathResolver';
import {
  createVSCodeProjectSearchContextResolver,
  resolveProjectSearchContext as resolveProjectSearchContextBase,
  type VSCodeProjectSearchContextResolverOptions,
} from '@neko/search/host-vscode';

export { createVSCodeProjectSearchContextResolver, type VSCodeProjectSearchContextResolverOptions };

// TODO(P2): Remove this Agent compatibility shim after internal imports move to @neko/search.
// Agent keeps resolveDocumentPath as the default so legacy callers still use its path settings.
export function resolveProjectSearchContext(
  query: Parameters<typeof resolveProjectSearchContextBase>[0],
  options: VSCodeProjectSearchContextResolverOptions = {},
) {
  return resolveProjectSearchContextBase(query, {
    resolvePath: options.resolvePath ?? resolveDocumentPath,
  });
}
