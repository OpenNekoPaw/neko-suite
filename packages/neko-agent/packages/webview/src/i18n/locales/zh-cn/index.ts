import type { MessageBundle } from '@neko/shared';

import { accountBar } from './accountBar';
import { animation } from './animation';
import { audio } from './audio';
import { blendMode } from './blendMode';
import { chat } from './chat';
import { colorCorrection } from './colorCorrection';
import { common } from './common';
import { effects } from './effects';
import { errors } from './errors';
import { exportBundle } from './export';
import { header } from './header';
import { history } from './history';
import { mask } from './mask';
import { onboarding } from './onboarding';
import { preview } from './preview';
import { promptTemplates } from './promptTemplates';
import { propertyPanel } from './propertyPanel';
import { settings } from './settings';
import { shape } from './shape';
import { speed } from './speed';
import { subtitles } from './subtitles';
import { tasks } from './tasks';
import { timeline } from './timeline';
import { toolCalls } from './toolCalls';
import { transition } from './transition';

export const bundles: Record<string, MessageBundle> = {
  accountBar,
  animation,
  audio,
  blendMode,
  chat,
  colorCorrection,
  common,
  effects,
  errors,
  exportBundle,
  header,
  history,
  mask,
  onboarding,
  preview,
  promptTemplates,
  propertyPanel,
  settings,
  shape,
  speed,
  subtitles,
  tasks,
  timeline,
  toolCalls,
  transition,
};
