import {
  DASHBOARD_PROJECT_GLOB_EXTENSION_LIST,
  type DashboardProjectType,
} from '@neko/shared/types/dashboard-project';

export {
  getDashboardProjectTypeForExtension,
  isDashboardProjectType,
  type DashboardProjectType,
} from '@neko/shared/types/dashboard-project';

export const SUPPORTED_PROJECT_FILE_PATTERN = `**/*.{${DASHBOARD_PROJECT_GLOB_EXTENSION_LIST}}`;

const PROJECT_CREATE_COMMANDS = {
  video: 'neko.newProject',
  canvas: 'neko.canvas.new',
  sketch: 'neko.sketch.new',
  audio: 'neko.audio.new',
  model: 'neko.model.new',
  puppet: 'neko.puppet.new',
} satisfies Record<DashboardProjectType, string>;

export function getProjectCreateCommand(projectType: DashboardProjectType): string {
  return PROJECT_CREATE_COMMANDS[projectType];
}
