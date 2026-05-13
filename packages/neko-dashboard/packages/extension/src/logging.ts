import type { ILogger } from '@neko/shared';

export type DashboardLogger = ILogger;

export const NOOP_DASHBOARD_LOGGER: DashboardLogger = {
  source: 'NekoDashboard',
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return this;
  },
  setLevel() {},
};
