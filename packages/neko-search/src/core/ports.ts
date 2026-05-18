import type { ProjectSearchQuery, ProjectSearchQueryContext } from '@neko/shared';

export interface ProjectSearchDisposable {
  dispose(): void;
}

export type ProjectSearchEvent<T> = (listener: (event: T) => void) => ProjectSearchDisposable;

export interface ProjectSearchLogger {
  warn(message: string, metadata?: Record<string, unknown>): void;
}

export type ProjectSearchContextResolver = (
  query: ProjectSearchQuery,
) => Promise<ProjectSearchQueryContext>;

export interface ProjectSearchRuntimePorts {
  readonly resolveContext: ProjectSearchContextResolver;
  readonly getWorkspaceRoots?: () => readonly string[];
  readonly logger?: ProjectSearchLogger;
  readonly now?: () => Date;
}
