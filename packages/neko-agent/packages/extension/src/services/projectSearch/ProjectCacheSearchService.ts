import * as vscode from 'vscode';
import type {
  ProjectIndexChangeEvent,
  ProjectIndexChangedRef,
  ProjectIndexUpdateReason,
  ProjectSearchAdapter,
  ProjectSearchPartitionKind,
  ProjectSearchQuery,
  ProjectSearchResult,
} from '@neko/shared';
import { ProjectIndexCoordinator } from './ProjectIndexCoordinator';

export class ProjectCacheSearchService implements vscode.Disposable {
  readonly onDidChangeProjectIndex: vscode.Event<ProjectIndexChangeEvent>;

  constructor(private readonly coordinator = new ProjectIndexCoordinator()) {
    this.onDidChangeProjectIndex = this.coordinator.onDidChangeProjectIndex;
  }

  registerAdapter(adapter: ProjectSearchAdapter): vscode.Disposable {
    return this.coordinator.registerAdapter(adapter);
  }

  async ensureInitialized(projectRoot?: string): Promise<void> {
    await this.coordinator.ensureInitialized(projectRoot);
  }

  async query(query: ProjectSearchQuery): Promise<ProjectSearchResult> {
    const result = await this.coordinator.query(query);
    return {
      query,
      context: result.context,
      items: result.items,
      partitions: result.partitions,
      freshness: result.freshness,
      generation: result.generation,
    };
  }

  async refresh(
    projectRoot: string,
    reason: ProjectIndexUpdateReason,
    options: {
      readonly partition?: ProjectSearchPartitionKind;
      readonly changedRefs?: readonly ProjectIndexChangedRef[];
    } = {},
  ): Promise<void> {
    await this.coordinator.refresh(projectRoot, reason, options);
  }

  getStatus(projectRoot?: string) {
    return this.coordinator.getStatus(projectRoot);
  }

  dispose(): void {
    this.coordinator.dispose();
  }
}
