import { useState, useMemo } from 'react';
import { ConfiguredWorkflow } from '@/components/types';
import { getWorkflowCategoryName, type WorkflowEngineType, type WorkflowCategory } from '@/config/workflow-engines';
import { useTranslation } from '@/i18n/I18nContext';

interface WorkflowSettingsProps {
  configuredWorkflows: ConfiguredWorkflow[];
  onUpdateWorkflows: (workflows: ConfiguredWorkflow[]) => void;
  onDeleteWorkflow: (workflowId: string) => void;
  onTestWorkflow?: (workflow: ConfiguredWorkflow) => Promise<{ success: boolean; error?: string }>;
}

interface WorkflowFormData {
  id: string;
  name: string;
  engineType: string;
  url: string;
  apiKey: string;
}

const DEFAULT_FORM_DATA: WorkflowFormData = {
  id: '',
  name: '',
  engineType: '',
  url: '',
  apiKey: '',
};

// 扩展类型用于显示
interface DisplayWorkflow {
  id: string;
  name: string;
  engineType: string;
  url: string;
  apiKey?: string;
  isBuiltin: boolean;
  enabled: boolean;
  description?: string;
  category?: string;
  icon?: string;
}

// Group type for display
type WorkflowGroupType = 'builtin' | 'custom';

/**
 * Group workflows by builtin vs custom
 */
function groupByType(workflows: DisplayWorkflow[]): Record<WorkflowGroupType, DisplayWorkflow[]> {
  const groups: Record<WorkflowGroupType, DisplayWorkflow[]> = {
    builtin: [],
    custom: [],
  };

  for (const workflow of workflows) {
    if (workflow.isBuiltin) {
      groups.builtin.push(workflow);
    } else {
      groups.custom.push(workflow);
    }
  }

  return groups;
}

/**
 * Group section header with count
 */
function GroupHeader({ groupType, count, t }: { groupType: WorkflowGroupType; count: number; t: (key: string) => string }) {
  const labels: Record<WorkflowGroupType, string> = {
    builtin: t('settings.skills.groupBuiltin'),
    custom: t('settings.skills.groupCustom'),
  };

  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[11px] font-medium text-[var(--vscode-descriptionForeground)]">
        {labels[groupType]}
      </span>
      <span className="text-[9px] px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
        {count}
      </span>
    </div>
  );
}

export function WorkflowSettings({
  configuredWorkflows,
  onUpdateWorkflows,
  onDeleteWorkflow,
  onTestWorkflow,
}: WorkflowSettingsProps) {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<WorkflowFormData>(DEFAULT_FORM_DATA);
  const [testingWorkflowId, setTestingWorkflowId] = useState<string | null>(null);
  const [workflowErrors, setWorkflowErrors] = useState<Record<string, string>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<WorkflowGroupType, boolean>>({
    builtin: true,
    custom: true,
  });

  // 合并内置和用户配置的 Workflow - configuredWorkflows 已包含所有 workflow (从 Platform 获取)
  const allWorkflows: DisplayWorkflow[] = configuredWorkflows.map(workflow => ({
    id: workflow.id,
    name: workflow.name,
    engineType: workflow.engineType,
    url: workflow.url,
    apiKey: workflow.apiKey,
    isBuiltin: workflow.builtin ?? false,
    enabled: workflow.enabled ?? false,
    description: workflow.description,
    category: workflow.category,
    icon: workflow.icon,
  }));

  // Group by builtin vs custom
  const groupedWorkflows = useMemo(() => groupByType(allWorkflows), [allWorkflows]);

  // Toggle group expansion
  const toggleGroup = (groupType: WorkflowGroupType) => {
    setExpandedGroups(prev => ({ ...prev, [groupType]: !prev[groupType] }));
  };

  // 提交表单
  const handleSubmit = () => {
    if (!formData.name || !formData.engineType || !formData.url) return;
    const newWorkflow: ConfiguredWorkflow = {
      id: formData.id || `workflow-${Date.now()}`,
      name: formData.name,
      description: '',
      engineType: formData.engineType as WorkflowEngineType,
      category: 'automation',
      url: formData.url,
      apiKey: formData.apiKey || undefined,
      enabled: true,
    };

    if (editingId) {
      // 使用 workflow 自身的 builtin 属性判断
      const existingWorkflow = configuredWorkflows.find(w => w.id === editingId);
      const isBuiltin = existingWorkflow?.builtin ?? false;
      if (isBuiltin) {
        // 对于内置 workflow，更新配置
        onUpdateWorkflows(configuredWorkflows.map(w => w.id === editingId ? { ...newWorkflow, builtin: true } : w));
      } else {
        onUpdateWorkflows(configuredWorkflows.map(w => w.id === editingId ? newWorkflow : w));
      }
    } else {
      onUpdateWorkflows([...configuredWorkflows, newWorkflow]);
    }
    handleCancelForm();
  };

  // 取消表单
  const handleCancelForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    setFormData(DEFAULT_FORM_DATA);
  };

  // 编辑
  const handleEdit = (workflow: DisplayWorkflow) => {
    setFormData({
      id: workflow.id,
      name: workflow.name,
      engineType: workflow.engineType,
      url: workflow.url,
      apiKey: '',
    });
    setEditingId(workflow.id);
    setShowAddForm(true);
  };

  // 删除
  const handleRemove = (id: string) => {
    onDeleteWorkflow(id);
  };

  // 切换启用状态
  const handleToggle = async (workflowId: string, enabled: boolean) => {
    // 清除之前的错误
    setWorkflowErrors(prev => {
      const next = { ...prev };
      delete next[workflowId];
      return next;
    });

    // 获取 workflow 配置 - 直接从 configuredWorkflows 获取
    const getWorkflowConfig = (): ConfiguredWorkflow | null => {
      return configuredWorkflows.find(w => w.id === workflowId) || null;
    };

    // 更新启用状态的辅助函数 - 直接更新 configuredWorkflows
    const updateWorkflowEnabled = (wfId: string, isEnabled: boolean) => {
      onUpdateWorkflows(configuredWorkflows.map(w => w.id === wfId ? { ...w, enabled: isEnabled } : w));
    };

    // 如果是禁用，直接禁用
    if (!enabled) {
      updateWorkflowEnabled(workflowId, false);
      return;
    }

    // 如果是启用，先测试连接
    const workflowConfig = getWorkflowConfig();
    if (!workflowConfig) return;

    if (onTestWorkflow) {
      setTestingWorkflowId(workflowId);
      try {
        const result = await onTestWorkflow(workflowConfig);
        if (result.success) {
          updateWorkflowEnabled(workflowId, true);
        } else {
          setWorkflowErrors(prev => ({
            ...prev,
            [workflowId]: result.error || 'Failed to connect to workflow',
          }));
        }
      } catch (error) {
        setWorkflowErrors(prev => ({
          ...prev,
          [workflowId]: error instanceof Error ? error.message : 'Connection failed',
        }));
      } finally {
        setTestingWorkflowId(null);
      }
    } else {
      // 没有测试函数，直接启用
      updateWorkflowEnabled(workflowId, true);
    }
  };

  // 复制
  const handleDuplicate = (workflow: DisplayWorkflow) => {
    const newWorkflow: ConfiguredWorkflow = {
      id: `workflow-${Date.now()}`,
      name: `${workflow.name} (Copy)`,
      description: workflow.description || '',
      engineType: workflow.engineType as WorkflowEngineType,
      category: (workflow.category as ConfiguredWorkflow['category']) || 'automation',
      url: workflow.url,
      apiKey: workflow.apiKey,
      enabled: true,
    };
    onUpdateWorkflows([...configuredWorkflows, newWorkflow]);
  };

  // Render a single workflow item
  const renderWorkflow = (workflow: DisplayWorkflow) => {
    const isEnabled = workflow.enabled !== false;
    const isTesting = testingWorkflowId === workflow.id;
    const error = workflowErrors[workflow.id];

    return (
      <div
        key={workflow.id}
        className={`border rounded transition-colors ${
          error
            ? 'border-[var(--vscode-errorForeground)]'
            : isEnabled
            ? 'border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
            : 'border-[var(--vscode-panel-border)] opacity-60'
        }`}
      >
        <div className="flex items-center gap-2 p-2">
          {/* Toggle Switch */}
          <button
            onClick={() => handleToggle(workflow.id, !isEnabled)}
            disabled={isTesting}
            className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${
              isTesting
                ? 'bg-[var(--vscode-input-background)] animate-pulse'
                : isEnabled
                ? 'bg-[var(--vscode-button-background)]'
                : 'bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]'
            }`}
            title={isTesting ? t('settings.workflows.connecting') : isEnabled ? t('common.disable') : t('common.enable')}
          >
            <span
              className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all ${
                isEnabled
                  ? 'left-4 bg-[var(--vscode-button-foreground)]'
                  : 'left-0.5 bg-[var(--vscode-descriptionForeground)]'
              }`}
            />
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className={`text-[11px] font-medium ${!isEnabled ? 'opacity-50' : ''}`}>
              {workflow.name}
              {isTesting && (
                <span className="ml-1.5 text-[9px] text-[var(--vscode-descriptionForeground)]">
                  {t('settings.workflows.connecting')}
                </span>
              )}
            </div>
            <div className={`text-[9px] truncate ${error ? 'text-[var(--vscode-errorForeground)]' : 'text-[var(--vscode-descriptionForeground)]'} ${!isEnabled && !error ? 'opacity-50' : ''}`}>
              {error || workflow.description || `${workflow.engineType} • ${workflow.url}`}
            </div>
          </div>

          {/* Category badge */}
          {workflow.category && (
            <span className={`text-[9px] px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded ${!isEnabled ? 'opacity-50' : ''}`}>
              {getWorkflowCategoryName(workflow.category as WorkflowCategory)}
            </span>
          )}

          {/* Actions */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => handleDuplicate(workflow)}
              className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
              title={t('settings.agents.duplicate')}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={() => handleEdit(workflow)}
              className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
              title={t('common.edit')}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            {!workflow.isBuiltin && (
              <button
                onClick={() => handleRemove(workflow.id)}
                className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100 text-[var(--vscode-errorForeground)]"
                title={t('common.remove')}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render a group (builtin or custom)
  const renderGroup = (groupType: WorkflowGroupType, workflows: DisplayWorkflow[]) => {
    if (workflows.length === 0) return null;

    const isExpanded = expandedGroups[groupType];

    return (
      <div key={groupType} className="mb-4">
        {/* Group Header */}
        <button
          onClick={() => toggleGroup(groupType)}
          className="w-full flex items-center gap-2 mb-2 hover:bg-[var(--vscode-list-hoverBackground)] rounded p-1 -ml-1"
        >
          <svg
            className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <GroupHeader groupType={groupType} count={workflows.length} t={t} />
        </button>

        {/* Group Content */}
        {isExpanded && (
          <div className="space-y-1.5 ml-4">
            {workflows.map(workflow => renderWorkflow(workflow))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Configured Workflows */}
      <div className="border border-[var(--vscode-panel-border)] rounded p-3">
        <h3 className="text-[12px] font-medium mb-2">{t('settings.workflows.title')}</h3>
        <p className="text-[10px] text-[var(--vscode-descriptionForeground)] mb-3">
          {t('settings.workflows.description')}
        </p>

        {/* Grouped workflows */}
        <div className="space-y-2">
          {renderGroup('builtin', groupedWorkflows.builtin)}
          {renderGroup('custom', groupedWorkflows.custom)}
        </div>

        {!showAddForm && (
          <button
            onClick={() => {
              setEditingId(null);
              setFormData(DEFAULT_FORM_DATA);
              setShowAddForm(true);
            }}
            className="w-full py-1.5 text-[11px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors"
          >
            {t('settings.workflows.addWorkflow')}
          </button>
        )}

        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="border border-[var(--vscode-focusBorder)] rounded p-3 space-y-3 bg-[var(--vscode-editor-background)]">
            <h3 className="text-[12px] font-medium">
              {editingId ? t('settings.workflows.editWorkflow') : t('settings.workflows.addWorkflow')}
            </h3>
            <div>
              <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">{t('settings.workflows.engineType')}</label>
              <select
                className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
                value={formData.engineType}
                onChange={(e) => {
                  setFormData(prev => ({
                    ...prev,
                    engineType: e.target.value,
                  }));
                }}
              >
                <option value="">{t('settings.workflows.selectEngine')}</option>
                <option value="comfyui">ComfyUI</option>
                <option value="dify">Dify</option>
                <option value="n8n">n8n</option>
                <option value="langflow">Langflow</option>
                <option value="flowise">Flowise</option>
                <option value="make">Make</option>
                <option value="zapier">Zapier</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">{t('settings.workflows.displayName')}</label>
              <input
                type="text"
                className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
                placeholder={t('settings.workflows.displayNamePlaceholder')}
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">{t('settings.workflows.url')}</label>
              <input
                type="text"
                className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded font-mono"
                placeholder={t('settings.workflows.urlPlaceholder')}
                value={formData.url}
                onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">{t('settings.workflows.apiKey')}</label>
              <input
                type="password"
                className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
                placeholder={t('settings.workflows.apiKeyPlaceholder')}
                value={formData.apiKey}
                onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCancelForm}
                className="flex-1 py-1.5 text-[11px] border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formData.name || !formData.engineType || !formData.url}
                className="flex-1 py-1.5 text-[11px] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded transition-colors disabled:opacity-50"
              >
                {editingId ? t('settings.providers.update') : t('common.add')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
