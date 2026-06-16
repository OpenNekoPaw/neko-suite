import type { MessageBundle } from '@neko/shared';

export const dashboard = {
  'dashboard.title': 'Neko Dashboard',
  'dashboard.summary': 'Dashboard summary',

  'dashboard.status': 'Runtime status',
  'dashboard.status.engine': 'Engine',
  'dashboard.status.projects': 'Projects',
  'dashboard.status.agent': 'Agent',
  'dashboard.status.assets': 'Assets',
  'dashboard.status.ready': 'Ready',
  'dashboard.status.running': '{running}/{total} running',
  'dashboard.status.files': '{count} files',
  'dashboard.status.endpointUnknown': 'Endpoint unknown',
  'dashboard.status.health.healthy': 'Healthy',
  'dashboard.status.health.unhealthy': 'Unhealthy',
  'dashboard.status.health.unknown': 'Health unknown',

  'dashboard.workflows': 'Creative Suite',

  'dashboard.workflow.fountain': 'Script',
  'dashboard.workflow.fountain.desc':
    'Write screenplay scenes, dialogue, and character appearances as the source for boards and timelines.',
  'dashboard.workflow.fountain.tags': 'Script, Scenes, Dialogue, Characters',
  'dashboard.workflow.fountain.action.primary': 'New Script',
  'dashboard.workflow.fountain.action.agent': 'Send Agent',

  'dashboard.workflow.nkc': 'Canvas',
  'dashboard.workflow.nkc.desc':
    'Arrange storyboard frames, narrative nodes, visual references, and canvas compositions.',
  'dashboard.workflow.nkc.tags': 'Canvas, Storyboard, Nodes, References',
  'dashboard.workflow.nkc.action.primary': 'New Canvas',
  'dashboard.workflow.nkc.action.preview': 'Narrative Preview',

  'dashboard.workflow.nkv': 'Editing',
  'dashboard.workflow.nkv.desc':
    'Build edit timelines, shot sequences, subtitles, and export jobs for final video output.',
  'dashboard.workflow.nkv.tags': 'Edit, Timeline, Subtitles, Export',
  'dashboard.workflow.nkv.action.primary': 'New Edit',

  'dashboard.workflow.nka': 'DAW',
  'dashboard.workflow.nka.desc':
    'Edit multitrack audio, recordings, denoise passes, mixing, and audio exports.',
  'dashboard.workflow.nka.tags': 'Multitrack, Recording, Mix, Export',
  'dashboard.workflow.nka.action.primary': 'New DAW',

  'dashboard.workflow.nkm': '3D Model',
  'dashboard.workflow.nkm.desc':
    'Manage 3D models, materials, viewport state, and character assets for animation and canvas work.',
  'dashboard.workflow.nkm.tags': '3D, Model, Materials, Viewport',
  'dashboard.workflow.nkm.action.primary': 'New 3D Model',
  'dashboard.workflow.nkm.action.live': 'Start Live',

  'dashboard.workflow.nkp': '2D Model',
  'dashboard.workflow.nkp.desc':
    'Author 2D skeletal characters, expressions, motions, and Live2D bindings for driven avatars.',
  'dashboard.workflow.nkp.tags': '2D, Rig, Expression, Live2D',
  'dashboard.workflow.nkp.action.primary': 'New 2D Model',
  'dashboard.workflow.nkp.action.live': 'Start Live',

  'dashboard.workflow.nks': 'Sketch',
  'dashboard.workflow.nks.desc':
    'Create native painting documents, layers, brush work, and repaintable visual assets.',
  'dashboard.workflow.nks.tags': 'Sketch, Layers, Brushes, Assets',
  'dashboard.workflow.nks.action.primary': 'New Sketch',

  'dashboard.workflow.unavailable': 'Unavailable',
  'dashboard.workflow.developing': 'In development',
  'dashboard.workflow.missing': 'Extension not installed',
  'dashboard.workflow.inactive': 'Extension not ready',
  'dashboard.workflow.activationFailed': 'Activation failed',

  'dashboard.skills': 'Installed Skills',
  'dashboard.skills.count': '{count} skills',
  'dashboard.skills.filteredCount': '{shown}/{total} skills',
  'dashboard.skills.allTags': 'All',
  'dashboard.skills.filterByTag': 'Filter skills by tag',
  'dashboard.skills.empty':
    'No skills available. Install Neko suite extensions to unlock AI capabilities.',
  'dashboard.skills.noFilteredResults': 'No skills match this filter.',
  'dashboard.skills.run': 'Run',
  'dashboard.skills.new': 'New Skill',
  'dashboard.skills.newNamePrompt': 'Skill name',
  'dashboard.skills.rescan': 'Rescan',
  'dashboard.skills.orchestrators': 'Orchestrators',
  'dashboard.skills.standalone': 'Standalone Skills',
  'dashboard.skills.quickActions': 'Quick Actions',
  'dashboard.skills.advanced': 'Advanced',
  'dashboard.skills.childSkills': 'Focused skills',
  'dashboard.skills.childSkillsWithCount': 'Focused ({count})',
  'dashboard.skills.showAdvanced': 'Show advanced ({count})',
  'dashboard.skills.hideAdvanced': 'Hide advanced',
  'dashboard.skills.source.builtin': 'Built-in',
  'dashboard.skills.source.project': 'Workspace',
  'dashboard.skills.source.personal': 'User',
  'dashboard.skills.source.market': 'Market',
  'dashboard.skills.source.plugin': 'Plugin',
  'dashboard.skills.role.orchestrator': 'Orchestrator',
  'dashboard.skills.role.focused-skill': 'Focused',
  'dashboard.skills.role.standalone': 'Standalone',
  'dashboard.skills.role.quick-action': 'Action',
  'dashboard.skills.role.persona': 'Persona',
  'dashboard.skills.action.run': 'Run',
  'dashboard.skills.action.edit': 'Edit',
  'dashboard.skills.action.reveal': 'Reveal',
  'dashboard.skills.action.fork': 'Fork',
  'dashboard.skills.action.create': 'Create',
  'dashboard.skills.action.duplicate': 'Duplicate',
  'dashboard.skills.action.rescan': 'Rescan',
} as const satisfies MessageBundle;
