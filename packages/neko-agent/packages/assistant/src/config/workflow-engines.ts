/**
 * Workflow Configuration
 *
 * Re-exports types from shared package and provides utility functions.
 * Builtin workflows are loaded from platform via ConfigManager.
 */

import type {
  WorkflowConfig,
  WorkflowEngineType,
  WorkflowCategory,
} from '@uniedit/shared';

// Re-export types from shared package
export type {
  WorkflowConfig,
  WorkflowEngineType,
  WorkflowCategory,
};

/**
 * Get workflow category display name
 */
export function getWorkflowCategoryName(category: WorkflowCategory): string {
  const categoryNames: Record<WorkflowCategory, string> = {
    'image-generation': 'Image Generation',
    'ai-workflow': 'AI Workflow',
    'automation': 'Automation',
    'integration': 'Integration',
  };
  return categoryNames[category] || category;
}

/**
 * Get workflow engine display name
 */
export function getWorkflowEngineName(engineType: WorkflowEngineType): string {
  const engineNames: Record<WorkflowEngineType, string> = {
    comfyui: 'ComfyUI',
    dify: 'Dify',
    n8n: 'n8n',
    make: 'Make',
    zapier: 'Zapier',
    langflow: 'Langflow',
    flowise: 'Flowise',
    custom: 'Custom',
  };
  return engineNames[engineType] || engineType;
}

/**
 * Get workflow engine icon
 */
export function getWorkflowEngineIcon(engineType: WorkflowEngineType): string {
  const engineIcons: Record<WorkflowEngineType, string> = {
    comfyui: '🎨',
    dify: '🔄',
    n8n: '⚡',
    make: '🔧',
    zapier: '⚙️',
    langflow: '🌊',
    flowise: '🌸',
    custom: '🔌',
  };
  return engineIcons[engineType] || '🔌';
}

/**
 * Get all workflow engine types
 */
export function getWorkflowEngineTypes(): WorkflowEngineType[] {
  return ['comfyui', 'dify', 'n8n', 'make', 'zapier', 'langflow', 'flowise', 'custom'];
}

/**
 * Get all workflow categories
 */
export function getWorkflowCategories(): WorkflowCategory[] {
  return ['image-generation', 'ai-workflow', 'automation', 'integration'];
}
