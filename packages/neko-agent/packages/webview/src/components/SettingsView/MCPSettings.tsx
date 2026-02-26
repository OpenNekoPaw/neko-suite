import { useState, useMemo } from 'react';
import { ConfiguredMCPServer } from '@/components/types';
import { getMCPCategoryName, type MCPServerCategory } from '@/config/mcp-servers';
import { useTranslation } from '@/i18n/I18nContext';

interface MCPSettingsProps {
  configuredMCPServers: ConfiguredMCPServer[];
  onUpdateServers: (servers: ConfiguredMCPServer[]) => void;
  onDeleteServer: (serverId: string) => void;
  onTestServer?: (server: ConfiguredMCPServer) => Promise<{ success: boolean; error?: string }>;
}

interface MCPFormData {
  id: string;
  name: string;
  command: string;
  args: string;
  envVars: string;
}

const DEFAULT_FORM_DATA: MCPFormData = {
  id: '',
  name: '',
  command: '',
  args: '',
  envVars: '',
};

// 扩展类型用于显示
interface DisplayMCPServer {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  isBuiltin: boolean;
  enabled: boolean;
  description?: string;
  category?: string;
}

// Group type for display
type MCPGroupType = 'builtin' | 'custom';

/**
 * Group servers by builtin vs custom
 */
function groupByType(servers: DisplayMCPServer[]): Record<MCPGroupType, DisplayMCPServer[]> {
  const groups: Record<MCPGroupType, DisplayMCPServer[]> = {
    builtin: [],
    custom: [],
  };

  for (const server of servers) {
    if (server.isBuiltin) {
      groups.builtin.push(server);
    } else {
      groups.custom.push(server);
    }
  }

  return groups;
}

/**
 * Group section header with count
 */
function GroupHeader({ groupType, count, t }: { groupType: MCPGroupType; count: number; t: (key: string) => string }) {
  const labels: Record<MCPGroupType, string> = {
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

export function MCPSettings({
  configuredMCPServers,
  onUpdateServers,
  onDeleteServer,
  onTestServer,
}: MCPSettingsProps) {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<MCPFormData>(DEFAULT_FORM_DATA);
  const [testingServerId, setTestingServerId] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<MCPGroupType, boolean>>({
    builtin: true,
    custom: true,
  });

  // 合并内置和用户配置的 MCP 服务器 - configuredMCPServers 已包含所有服务器 (从 Platform 获取)
  const allServers: DisplayMCPServer[] = configuredMCPServers.map(server => ({
    id: server.id,
    name: server.name,
    command: server.command || '',
    args: server.args,
    env: server.env,
    isBuiltin: server.builtin ?? false,
    enabled: server.enabled ?? false,
    description: server.description,
    category: server.category,
  }));

  // Group by builtin vs custom
  const groupedServers = useMemo(() => groupByType(allServers), [allServers]);

  // Toggle group expansion
  const toggleGroup = (groupType: MCPGroupType) => {
    setExpandedGroups(prev => ({ ...prev, [groupType]: !prev[groupType] }));
  };

  // 提交表单
  const handleSubmit = () => {
    if (!formData.name || !formData.command) return;
    const newServer: ConfiguredMCPServer = {
      id: formData.id || `mcp-${Date.now()}`,
      name: formData.name,
      description: '',
      category: 'other',
      transport: 'stdio',
      command: formData.command,
      args: formData.args ? formData.args.split(/\s+/).filter(Boolean) : undefined,
      env: formData.envVars ? Object.fromEntries(
        formData.envVars.split('\n').filter(Boolean).map(line => {
          const [key, ...rest] = line.split('=');
          return [key.trim(), rest.join('=').trim()];
        })
      ) : undefined,
      enabled: true,
    };

    if (editingId) {
      // 使用服务器自身的 builtin 属性判断
      const existingServer = configuredMCPServers.find(s => s.id === editingId);
      const isBuiltin = existingServer?.builtin ?? false;
      if (isBuiltin) {
        // 对于内置服务器，更新配置
        onUpdateServers(configuredMCPServers.map(s => s.id === editingId ? { ...newServer, builtin: true } : s));
      } else {
        onUpdateServers(configuredMCPServers.map(s => s.id === editingId ? newServer : s));
      }
    } else {
      onUpdateServers([...configuredMCPServers, newServer]);
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
  const handleEdit = (server: typeof allServers[0]) => {
    setFormData({
      id: server.id,
      name: server.name,
      command: server.command,
      args: server.args?.join(' ') || '',
      envVars: server.env ? Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join('\n') : '',
    });
    setEditingId(server.id);
    setShowAddForm(true);
  };

  // 删除
  const handleRemove = (id: string) => {
    onDeleteServer(id);
  };

  // 切换启用状态
  const handleToggle = async (serverId: string, enabled: boolean) => {
    // 清除之前的错误
    setServerErrors(prev => {
      const next = { ...prev };
      delete next[serverId];
      return next;
    });

    // 如果是禁用，直接更新状态
    if (!enabled) {
      updateServerEnabled(serverId, false);
      return;
    }

    // 如果是启用，先测试服务器
    const server = allServers.find(s => s.id === serverId);
    if (!server) return;

    // 如果有测试函数，先测试
    if (onTestServer) {
      setTestingServerId(serverId);
      try {
        const serverConfig: ConfiguredMCPServer = {
          id: server.id,
          name: server.name,
          description: server.description || '',
          category: (server.category as ConfiguredMCPServer['category']) || 'other',
          transport: 'stdio',
          command: server.command,
          args: server.args,
          env: server.env,
          enabled: true,
        };
        const result = await onTestServer(serverConfig);
        if (result.success) {
          updateServerEnabled(serverId, true);
        } else {
          setServerErrors(prev => ({
            ...prev,
            [serverId]: result.error || 'Failed to connect to server',
          }));
        }
      } catch (error) {
        setServerErrors(prev => ({
          ...prev,
          [serverId]: error instanceof Error ? error.message : 'Unknown error',
        }));
      } finally {
        setTestingServerId(null);
      }
    } else {
      // 没有测试函数，直接更新
      updateServerEnabled(serverId, true);
    }
  };

  // 更新服务器启用状态
  const updateServerEnabled = (serverId: string, enabled: boolean) => {
    // 直接更新服务器的 enabled 状态 - 所有服务器都在 configuredMCPServers 中
    onUpdateServers(configuredMCPServers.map(s => s.id === serverId ? { ...s, enabled } : s));
  };

  // 复制
  const handleDuplicate = (server: typeof allServers[0]) => {
    const newServer: ConfiguredMCPServer = {
      id: `mcp-${Date.now()}`,
      name: `${server.name} (Copy)`,
      description: server.description || '',
      category: (server.category as ConfiguredMCPServer['category']) || 'other',
      transport: 'stdio',
      command: server.command,
      args: server.args,
      env: server.env,
      enabled: true,
    };
    onUpdateServers([...configuredMCPServers, newServer]);
  };

  // Render a single server item
  const renderServer = (server: DisplayMCPServer) => {
    const isEnabled = server.enabled !== false;
    const isTesting = testingServerId === server.id;
    const error = serverErrors[server.id];

    return (
      <div
        key={server.id}
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
            onClick={() => handleToggle(server.id, !isEnabled)}
            disabled={isTesting}
            className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${
              isTesting
                ? 'bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] cursor-wait'
                : isEnabled
                  ? 'bg-[var(--vscode-button-background)]'
                  : 'bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)]'
            }`}
            title={isTesting ? t('common.testing') : isEnabled ? t('common.disable') : t('common.enable')}
          >
            {isTesting ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-2 h-2 bg-[var(--vscode-descriptionForeground)] rounded-full animate-pulse" />
              </span>
            ) : (
              <span
                className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all ${
                  isEnabled
                    ? 'left-4 bg-[var(--vscode-button-foreground)]'
                    : 'left-0.5 bg-[var(--vscode-descriptionForeground)]'
                }`}
              />
            )}
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className={`text-[11px] font-medium ${!isEnabled ? 'opacity-50' : ''}`}>
              {server.name}
              {isTesting && (
                <span className="ml-1.5 text-[9px] text-[var(--vscode-descriptionForeground)]">
                  {t('settings.mcp.connecting')}
                </span>
              )}
            </div>
            <div className={`text-[9px] truncate ${error ? 'text-[var(--vscode-errorForeground)]' : 'text-[var(--vscode-descriptionForeground)]'} ${!isEnabled && !error ? 'opacity-50' : ''}`}>
              {error || server.description || `${server.command} ${server.args?.join(' ') || ''}`}
            </div>
          </div>

          {/* Category badge */}
          {server.category && (
            <span className={`text-[9px] px-1.5 py-0.5 bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded ${!isEnabled ? 'opacity-50' : ''}`}>
              {getMCPCategoryName(server.category as MCPServerCategory)}
            </span>
          )}

          {/* Actions */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => handleDuplicate(server)}
              className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
              title={t('settings.agents.duplicate')}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={() => handleEdit(server)}
              className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded opacity-60 hover:opacity-100"
              title={t('common.edit')}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            {!server.isBuiltin && (
              <button
                onClick={() => handleRemove(server.id)}
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
  const renderGroup = (groupType: MCPGroupType, servers: DisplayMCPServer[]) => {
    if (servers.length === 0) return null;

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
          <GroupHeader groupType={groupType} count={servers.length} t={t} />
        </button>

        {/* Group Content */}
        {isExpanded && (
          <div className="space-y-1.5 ml-4">
            {servers.map(server => renderServer(server))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Configured MCP Servers */}
      <div className="border border-[var(--vscode-panel-border)] rounded p-3">
        <h3 className="text-[12px] font-medium mb-2">{t('settings.mcp.title')}</h3>
        <p className="text-[10px] text-[var(--vscode-descriptionForeground)] mb-3">
          {t('settings.mcp.description')}
        </p>

        {/* Grouped servers */}
        <div className="space-y-2">
          {renderGroup('builtin', groupedServers.builtin)}
          {renderGroup('custom', groupedServers.custom)}
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
            {t('settings.mcp.addServer')}
          </button>
        )}

        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="border border-[var(--vscode-focusBorder)] rounded p-3 space-y-3 bg-[var(--vscode-editor-background)]">
            <h3 className="text-[12px] font-medium">
              {editingId ? t('settings.mcp.editServer') : t('settings.mcp.addServer')}
            </h3>
            <div>
              <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">{t('settings.mcp.name')}</label>
              <input
                type="text"
                className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
                placeholder={t('settings.mcp.namePlaceholder')}
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">{t('settings.mcp.command')}</label>
              <input
                type="text"
                className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded font-mono"
                placeholder={t('settings.mcp.commandPlaceholder')}
                value={formData.command}
                onChange={(e) => setFormData(prev => ({ ...prev, command: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">{t('settings.mcp.arguments')}</label>
              <input
                type="text"
                className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded font-mono"
                placeholder={t('settings.mcp.argumentsPlaceholder')}
                value={formData.args}
                onChange={(e) => setFormData(prev => ({ ...prev, args: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-1">{t('settings.mcp.envVars')}</label>
              <textarea
                className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded font-mono resize-none"
                rows={3}
                placeholder={t('settings.mcp.envVarsPlaceholder')}
                value={formData.envVars}
                onChange={(e) => setFormData(prev => ({ ...prev, envVars: e.target.value }))}
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
                disabled={!formData.name || !formData.command}
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
