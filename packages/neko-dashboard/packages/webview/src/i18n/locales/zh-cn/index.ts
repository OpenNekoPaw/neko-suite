import type { MessageBundle } from '@neko/shared';

import { common } from './common';
import { dashboard } from './dashboard';
import { projects } from './projects';
import { recent } from './recent';
import { tasks } from './tasks';

export const bundles: Record<string, MessageBundle> = {
  common,
  dashboard,
  projects,
  recent,
  tasks,
};
