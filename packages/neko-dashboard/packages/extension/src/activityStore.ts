export class RetiredDashboardActivityStoreError extends Error {
  override readonly name = 'RetiredDashboardActivityStoreError';
  readonly code = 'dashboard-retired-activity-store';

  constructor() {
    super(
      'Workspace dashboard-activity.json is retired; Dashboard activity is a rebuildable recent-task projection.',
    );
  }
}

export class ActivityStore {
  constructor() {
    throw new RetiredDashboardActivityStoreError();
  }
}
