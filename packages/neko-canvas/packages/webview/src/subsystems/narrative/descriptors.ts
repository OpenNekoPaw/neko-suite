import type { NodeTypeDescriptorRegistry } from '../../components/nodes/nodeTypeDescriptor';

export function createNarrativeNodeTypeDescriptors(): NodeTypeDescriptorRegistry {
  return {
    choice: {
      type: 'choice',
      labelKey: 'node.choice',
      icon: '◇',
      tagLabel: 'CHOICE',
      tagColor: '#f97316',
      defaultSize: { width: 220, height: 120 },
    },
    merge: {
      type: 'merge',
      labelKey: 'node.merge',
      icon: '◆',
      tagLabel: 'MERGE',
      tagColor: '#22c55e',
      defaultSize: { width: 180, height: 96 },
    },
    'narrative-scene': {
      type: 'narrative-scene',
      labelKey: 'node.narrativeScene',
      icon: '§',
      tagLabel: 'SCENE',
      tagColor: '#0ea5e9',
      defaultSize: { width: 260, height: 150 },
    },
    'narrative-note': {
      type: 'narrative-note',
      labelKey: 'node.narrativeNote',
      icon: '¶',
      tagLabel: 'NOTE',
      tagColor: '#a855f7',
      defaultSize: { width: 220, height: 120 },
    },
  };
}
