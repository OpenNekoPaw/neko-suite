import * as vscode from 'vscode';
import type {
  AgentContextPayload,
  CreativeEntity,
  EntityAssetBinding,
  EntityAssetRequirement,
  NekoAssetsAPI,
  RepresentationKind,
  VisualFactSuggestion,
  VisualIdentityDraft,
} from '@neko/shared';
import { NEKO_EXTENSION_IDS } from '@neko/shared';
import {
  type CreativeEntityRegistryService,
  type EntityAssetBindingService,
  type EntityAssetRequirementService,
  type VisualIdentityDraftService,
} from '@neko/entity/core';
import { createVSCodeEntityServices } from '@neko/entity/host-vscode';
import {
  CreativeEntityManagementService,
  ENTITY_MANAGEMENT_BINDING_ROLES,
  type AssetBindingOption,
  type CreativeEntityDetailView,
  type ManageableEntityAssetBindingRole,
  getRequirementActions,
  representationKindToBindingRole,
} from '../services/CreativeEntityManagementService';
import type { ICreativeEntityGraph, ICreativeEntityWorkspaceIndex } from '../services/types';
import { handleError } from '../utils/errorHandler';

interface CreativeEntityCommandServices {
  readonly creativeEntityIndex: ICreativeEntityWorkspaceIndex;
  readonly entityGraph: ICreativeEntityGraph;
}

interface CreativeEntityCommandContext {
  readonly workspaceRoot: string;
  readonly registry: CreativeEntityRegistryService;
  readonly bindings: EntityAssetBindingService;
  readonly requirements: EntityAssetRequirementService;
  readonly drafts: VisualIdentityDraftService;
  readonly management: CreativeEntityManagementService;
}

interface EntityQuickPickItem extends vscode.QuickPickItem {
  readonly entity: CreativeEntity;
}

interface BindingRoleQuickPickItem extends vscode.QuickPickItem {
  readonly role: ManageableEntityAssetBindingRole;
}

interface AssetBindingQuickPickItem extends vscode.QuickPickItem {
  readonly option: AssetBindingOption;
}

interface DraftQuickPickItem extends vscode.QuickPickItem {
  readonly draft: VisualIdentityDraft;
}

interface DraftAssetQuickPickItem extends vscode.QuickPickItem {
  readonly assetId: string;
}

interface DraftFactQuickPickItem extends vscode.QuickPickItem {
  readonly draft: VisualIdentityDraft;
  readonly fact: VisualFactSuggestion;
}

interface RequirementQuickPickItem extends vscode.QuickPickItem {
  readonly requirement: EntityAssetRequirement;
}

interface RequirementActionQuickPickItem extends vscode.QuickPickItem {
  readonly action: 'generate' | 'import' | 'bind-existing' | 'dismiss';
}

interface PackageQuickPickItem extends vscode.QuickPickItem {
  readonly itemType: 'package';
  readonly assetEntityId: string;
}

interface PackageRoleQuickPickItem extends vscode.QuickPickItem {
  readonly itemType: 'assign-role';
  readonly role: ManageableEntityAssetBindingRole;
}

export function registerCreativeEntityCommands(
  context: vscode.ExtensionContext,
  services: CreativeEntityCommandServices,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.story.showCreativeEntityDetail', async () => {
      await runCreativeEntityCommand(services, async (commandContext) => {
        const entity = await pickCreativeEntity(commandContext.management);
        if (!entity) return;

        const detail = await commandContext.management.getEntityDetail(entity.id);
        if (!detail) return;

        const picked = await vscode.window.showQuickPick(buildEntityDetailItems(detail), {
          title: `实体详情：${formatEntityName(entity)}`,
          placeHolder: '查看别名、状态、关系、出现点、默认素材与待补项',
        });
        if (!picked) return;

        if (picked.action === 'bind') {
          await vscode.commands.executeCommand('neko.story.setCreativeEntityDefaultBinding', {
            entityId: entity.id,
          });
        } else if (picked.action === 'drafts') {
          await vscode.commands.executeCommand('neko.story.reviewVisualDrafts', {
            entityId: entity.id,
          });
        } else if (picked.action === 'requirements') {
          await vscode.commands.executeCommand('neko.story.showMissingMaterialQueue', {
            entityId: entity.id,
          });
        }
      });
    }),
    vscode.commands.registerCommand(
      'neko.story.setCreativeEntityDefaultBinding',
      async (args?: {
        readonly entityId?: string;
        readonly role?: ManageableEntityAssetBindingRole;
      }) => {
        await runCreativeEntityCommand(services, async (commandContext) => {
          const entity =
            (args?.entityId ? await commandContext.registry.get(args.entityId) : undefined) ??
            (await pickCreativeEntity(commandContext.management));
          if (!entity) return;

          const role = args?.role ?? (await pickBindingRole());
          if (!role) return;

          const assetsApi = await getAssetsApi();
          if (!assetsApi) {
            await vscode.window.showWarningMessage('未找到 Neko Assets，无法选择素材绑定。');
            return;
          }

          const option = await pickBindingOption(commandContext.management, assetsApi, role);
          if (!option) return;

          await commandContext.bindings.setDefault(
            commandContext.management.buildDefaultBinding({
              entity,
              role,
              assetRef: option.assetRef,
              confidence: option.confidence,
            }),
          );
          await markMatchingRequirementsBound(commandContext.requirements, entity.id, role);
          await vscode.commands.executeCommand('neko.assets.entityChanged');
          await vscode.window.showInformationMessage(
            `已将 ${option.label} 设为 ${formatEntityName(entity)} 的默认 ${role}。`,
          );
        });
      },
    ),
    vscode.commands.registerCommand(
      'neko.story.reviewVisualDrafts',
      async (args?: { readonly entityId?: string }) => {
        await runCreativeEntityCommand(services, async (commandContext) => {
          const drafts = await commandContext.drafts.list();
          const candidates = args?.entityId
            ? drafts.filter((draft) => draft.characterId === args.entityId)
            : drafts;
          const draft = await pickVisualDraft(candidates);
          if (!draft) return;

          const action = await vscode.window.showQuickPick(
            [
              { label: '$(check) 选择生成图', action: 'select-asset' as const },
              { label: '$(check-all) 接受视觉事实', action: 'accept-fact' as const },
              { label: '$(close) 拒绝视觉事实', action: 'reject-fact' as const },
              { label: '$(pass) 标记已应用', action: 'apply' as const },
              { label: '$(trash) 丢弃草稿', action: 'discard' as const },
            ],
            {
              title: `AI 形象草稿：${draft.characterId}`,
              placeHolder: '选择要确认的草稿操作',
            },
          );
          if (!action) return;

          if (action.action === 'select-asset') {
            const assetId = await pickDraftAsset(draft);
            if (!assetId) return;
            await commandContext.drafts.upsert(
              commandContext.management.buildDraftSelection(draft, assetId),
            );
          } else if (action.action === 'accept-fact' || action.action === 'reject-fact') {
            const fact = await pickDraftFact(draft);
            if (!fact) return;
            await commandContext.drafts.upsert(
              commandContext.management.buildDraftFactDecision(
                draft,
                fact,
                action.action === 'accept-fact',
              ),
            );
          } else {
            await commandContext.drafts.upsert(
              commandContext.management.buildDraftStatusUpdate(
                draft,
                action.action === 'apply' ? 'applied' : 'discarded',
              ),
            );
          }

          await vscode.window.showInformationMessage('AI 形象草稿已更新，未自动覆盖人物事实。');
        });
      },
    ),
    vscode.commands.registerCommand(
      'neko.story.showMissingMaterialQueue',
      async (args?: { readonly entityId?: string }) => {
        await runCreativeEntityCommand(services, async (commandContext) => {
          const requirements = (await commandContext.requirements.list()).filter(
            (requirement) =>
              (!args?.entityId || requirement.entityId === args.entityId) &&
              requirement.status !== 'dismissed' &&
              requirement.status !== 'bound',
          );
          const requirement = await pickRequirement(requirements);
          if (!requirement) return;

          const action = await pickRequirementAction(requirement);
          if (!action) return;

          if (action === 'dismiss') {
            await commandContext.requirements.upsert(
              commandContext.management.buildRequirementStatusUpdate(requirement, 'dismissed'),
            );
            await vscode.window.showInformationMessage('已忽略该待补素材需求。');
          } else if (action === 'bind-existing') {
            await bindRequirementToExistingAsset(commandContext, requirement);
          } else if (action === 'import') {
            await vscode.commands.executeCommand('neko.assets.importFile');
            await commandContext.requirements.upsert(
              commandContext.management.buildRequirementStatusUpdate(requirement, 'suggested'),
            );
          } else {
            await sendRequirementToAgent(requirement);
            await commandContext.requirements.upsert(
              commandContext.management.buildRequirementStatusUpdate(requirement, 'suggested'),
            );
          }
        });
      },
    ),
    vscode.commands.registerCommand(
      'neko.story.showRepresentationPackageDetail',
      async (args?: { readonly assetEntityId?: string; readonly entityId?: string }) => {
        await runCreativeEntityCommand(services, async (commandContext) => {
          const assetsApi = await getAssetsApi();
          if (!assetsApi) {
            await vscode.window.showWarningMessage('未找到 Neko Assets，无法查看表现包。');
            return;
          }

          const assetEntityId = args?.assetEntityId ?? (await pickPackageAssetEntityId(assetsApi));
          if (!assetEntityId) return;

          const detail = await assetsApi.getRepresentationPackageDetail(assetEntityId);
          if (!detail) return;

          const packageView = commandContext.management.buildRepresentationPackageView(
            detail,
            await commandContext.bindings.list(),
          );
          const picked = await vscode.window.showQuickPick(
            buildRepresentationPackageItems(packageView),
            {
              title: `表现包：${assetEntityId}`,
              placeHolder: '查看组件、缺失项、能力，或设为实体默认表现',
            },
          );
          if (!picked) return;

          if (picked.itemType === 'assign-role') {
            const entity =
              (args?.entityId ? await commandContext.registry.get(args.entityId) : undefined) ??
              (await pickCreativeEntity(commandContext.management));
            if (!entity) return;
            await commandContext.bindings.setDefault(
              commandContext.management.buildDefaultBinding({
                entity,
                role: picked.role,
                assetRef: packageView.assetRef,
              }),
            );
            await vscode.commands.executeCommand('neko.assets.entityChanged');
            await vscode.window.showInformationMessage(
              `已将表现包设为 ${formatEntityName(entity)} 的默认 ${picked.role}。`,
            );
          }
        });
      },
    ),
  );
}

async function runCreativeEntityCommand(
  services: CreativeEntityCommandServices,
  command: (context: CreativeEntityCommandContext) => Promise<void>,
): Promise<void> {
  try {
    const commandContext = createCreativeEntityCommandContext(services);
    if (!commandContext) {
      await vscode.window.showWarningMessage('请先打开一个 Neko 项目工作区。');
      return;
    }
    await command(commandContext);
  } catch (error) {
    await handleError(error, { showToUser: true });
  }
}

function createCreativeEntityCommandContext(
  services: CreativeEntityCommandServices,
): CreativeEntityCommandContext | undefined {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return undefined;
  }

  const { registry, bindings, requirements, drafts } = createVSCodeEntityServices({
    projectRoot: workspaceRoot,
  });
  const management = new CreativeEntityManagementService({
    entities: registry,
    bindings,
    requirements,
    drafts,
    workspaceIndex: services.creativeEntityIndex,
    graph: services.entityGraph,
  });

  return {
    workspaceRoot,
    registry,
    bindings,
    requirements,
    drafts,
    management,
  };
}

async function getAssetsApi(): Promise<NekoAssetsAPI | undefined> {
  const extension = vscode.extensions.getExtension<NekoAssetsAPI>(NEKO_EXTENSION_IDS.NEKO_ASSETS);
  if (!extension) return undefined;
  if (!extension.isActive) {
    await extension.activate();
  }
  return extension.exports;
}

async function pickCreativeEntity(
  management: CreativeEntityManagementService,
): Promise<CreativeEntity | undefined> {
  const entities = await management.listEntities();
  const picked = await vscode.window.showQuickPick<EntityQuickPickItem>(
    entities.map((entity) => ({
      label: formatEntityName(entity),
      description: `${entity.kind} · ${entity.status}`,
      detail: entity.aliases.length > 0 ? `Aliases: ${entity.aliases.join(', ')}` : undefined,
      entity,
    })),
    {
      title: '选择创作实体',
      placeHolder: entities.length > 0 ? '选择要管理的实体' : '当前项目没有可管理实体',
    },
  );
  return picked?.entity;
}

async function pickBindingRole(): Promise<ManageableEntityAssetBindingRole | undefined> {
  const picked = await vscode.window.showQuickPick<BindingRoleQuickPickItem>(
    ENTITY_MANAGEMENT_BINDING_ROLES.map((role) => ({
      label: `$(symbol-field) ${role}`,
      description: getBindingRoleDescription(role),
      role,
    })),
    { title: '选择默认表现类型' },
  );
  return picked?.role;
}

async function pickBindingOption(
  management: CreativeEntityManagementService,
  assetsApi: NekoAssetsAPI,
  role: ManageableEntityAssetBindingRole,
): Promise<AssetBindingOption | undefined> {
  const options = await management.buildAssetBindingOptions(assetsApi, role);
  const picked = await vscode.window.showQuickPick<AssetBindingQuickPickItem>(
    options.map((option) => ({
      label: `$(file-media) ${option.label}`,
      description: option.assetRef,
      detail: `${Math.round(option.confidence * 100)}% · ${option.reason}`,
      option,
    })),
    {
      title: `选择 ${role} 素材`,
      placeHolder: options.length > 0 ? '确认后会写入 neko/entity-bindings.json' : '没有匹配素材',
    },
  );
  return picked?.option;
}

async function pickVisualDraft(
  drafts: readonly VisualIdentityDraft[],
): Promise<VisualIdentityDraft | undefined> {
  const picked = await vscode.window.showQuickPick<DraftQuickPickItem>(
    drafts.map((draft) => ({
      label: `$(sparkle) ${draft.characterId}`,
      description: draft.status,
      detail: `${draft.generatedAssetIds.length} generated · ${draft.prompt}`,
      draft,
    })),
    {
      title: 'AI 形象草稿',
      placeHolder: drafts.length > 0 ? '选择要审核的草稿' : '没有待审核草稿',
    },
  );
  return picked?.draft;
}

async function pickDraftAsset(draft: VisualIdentityDraft): Promise<string | undefined> {
  const picked = await vscode.window.showQuickPick<DraftAssetQuickPickItem>(
    draft.generatedAssetIds.map((assetId) => ({
      label: `$(file-media) ${assetId}`,
      description: draft.selectedAssetId === assetId ? 'current selection' : undefined,
      assetId,
    })),
    { title: '选择生成图' },
  );
  return picked?.assetId;
}

async function pickDraftFact(
  draft: VisualIdentityDraft,
): Promise<VisualFactSuggestion | undefined> {
  const facts = draft.extractedVisualFacts ?? [];
  const picked = await vscode.window.showQuickPick<DraftFactQuickPickItem>(
    facts.map((fact) => ({
      label: `$(symbol-property) ${fact.key}`,
      description: fact.value,
      detail:
        typeof fact.confidence === 'number'
          ? `${Math.round(fact.confidence * 100)}% confidence`
          : undefined,
      draft,
      fact,
    })),
    {
      title: '选择视觉事实建议',
      placeHolder: facts.length > 0 ? '选择要接受或拒绝的事实' : '没有视觉事实建议',
    },
  );
  return picked?.fact;
}

async function pickRequirement(
  requirements: readonly EntityAssetRequirement[],
): Promise<EntityAssetRequirement | undefined> {
  const picked = await vscode.window.showQuickPick<RequirementQuickPickItem>(
    requirements.map((requirement) => ({
      label: `$(warning) ${requirement.entityId}`,
      description: `${requirement.source} · ${requirement.requiredKinds.join(', ')}`,
      detail: `${requirement.status} · ${requirement.sourceRef}`,
      requirement,
    })),
    {
      title: '待补素材队列',
      placeHolder: requirements.length > 0 ? '选择一个待补项' : '没有待补素材',
    },
  );
  return picked?.requirement;
}

async function pickRequirementAction(
  requirement: EntityAssetRequirement,
): Promise<RequirementActionQuickPickItem['action'] | undefined> {
  const picked = await vscode.window.showQuickPick<RequirementActionQuickPickItem>(
    getRequirementActions(requirement).map((action) => ({
      label: formatRequirementActionLabel(action),
      action,
    })),
    { title: `处理待补素材：${requirement.requiredKinds.join(', ')}` },
  );
  return picked?.action;
}

async function pickPackageAssetEntityId(assetsApi: NekoAssetsAPI): Promise<string | undefined> {
  const entities = await assetsApi.getAllEntities();
  const packages = await Promise.all(
    entities.map(async (entity): Promise<PackageQuickPickItem | undefined> => {
      const detail = await assetsApi.getRepresentationPackageDetail(entity.id);
      if (!detail || detail.representationKinds.length === 0) {
        return undefined;
      }
      return {
        itemType: 'package',
        assetEntityId: entity.id,
        label: `$(symbol-structure) ${entity.name}`,
        description: detail.representationKinds.join(', '),
        detail: detail.capabilities.join(', ') || 'no capabilities',
      };
    }),
  );
  const picked = await vscode.window.showQuickPick(
    packages.filter((item): item is PackageQuickPickItem => item !== undefined),
    { title: '选择表现包' },
  );
  return picked?.assetEntityId;
}

function buildEntityDetailItems(
  detail: CreativeEntityDetailView,
): Array<vscode.QuickPickItem & { readonly action?: string }> {
  const items: Array<vscode.QuickPickItem & { readonly action?: string }> = [
    {
      label: `$(account) ${formatEntityName(detail.entity)}`,
      description: `${detail.entity.kind} · ${detail.status}`,
      detail: detail.aliases.length > 0 ? `Aliases: ${detail.aliases.join(', ')}` : 'No aliases',
    },
    {
      label: '$(link) 设置默认素材',
      description: 'portrait / live2d / live3d / voice / motion / reference',
      action: 'bind',
    },
    {
      label: '$(sparkle) 审核 AI 形象草稿',
      description: `${detail.visualDrafts.length} drafts`,
      action: 'drafts',
    },
    {
      label: '$(warning) 查看待补素材',
      description: `${detail.missingRequirements.length} requirements`,
      action: 'requirements',
    },
  ];

  for (const binding of detail.defaults) {
    items.push({
      label: `$(pinned) 默认 ${binding.role}`,
      description: binding.assetRef,
      detail: `${binding.source} · ${binding.updatedAt}`,
    });
  }

  for (const occurrence of detail.occurrences.slice(0, 12)) {
    items.push({
      label: `$(references) ${occurrence.source}`,
      description: occurrence.location,
      detail: occurrence.detail ?? occurrence.label,
    });
  }

  for (const relationship of detail.relationships.slice(0, 12)) {
    items.push({
      label: `$(git-compare) ${relationship.type}`,
      description: `${relationship.from} -> ${relationship.to}`,
      detail: `${relationship.strength} · ${relationship.provenance}`,
    });
  }

  return items;
}

function buildRepresentationPackageItems(
  packageView: ReturnType<CreativeEntityManagementService['buildRepresentationPackageView']>,
): Array<vscode.QuickPickItem & (PackageRoleQuickPickItem | { readonly itemType: 'info' })> {
  const items: Array<
    vscode.QuickPickItem & (PackageRoleQuickPickItem | { readonly itemType: 'info' })
  > = [
    {
      itemType: 'info',
      label: '$(symbol-structure) Package summary',
      description: packageView.representationKinds.join(', ') || 'unknown representation',
      detail: [
        `Capabilities: ${packageView.capabilities.join(', ') || 'none'}`,
        `Missing: ${packageView.missingRoles.join(', ') || 'none'}`,
      ].join('\n'),
    },
  ];

  for (const role of packageView.assignableRoles) {
    items.push({
      itemType: 'assign-role',
      role,
      label: `$(link) 设为默认 ${role}`,
      description: packageView.assetRef,
    });
  }

  for (const file of packageView.files) {
    items.push({
      itemType: 'info',
      label: `$(${file.role === 'thumbnail' ? 'file-media' : 'file'}) ${file.role}`,
      description: file.path,
      detail: `${file.mediaType ?? 'unknown'} · ${file.assetRef}`,
    });
  }

  return items;
}

async function bindRequirementToExistingAsset(
  context: CreativeEntityCommandContext,
  requirement: EntityAssetRequirement,
): Promise<void> {
  const entity = await context.registry.get(requirement.entityId);
  if (!entity) return;

  const role = pickFirstManageableRole(requirement.requiredKinds);
  if (!role) return;

  const assetsApi = await getAssetsApi();
  if (!assetsApi) return;

  const option = await pickBindingOption(context.management, assetsApi, role);
  if (!option) return;

  await context.bindings.setDefault(
    context.management.buildDefaultBinding({
      entity,
      role,
      assetRef: option.assetRef,
      confidence: option.confidence,
    }),
  );
  await context.requirements.upsert(
    context.management.buildRequirementStatusUpdate(requirement, 'bound'),
  );
  await vscode.commands.executeCommand('neko.assets.entityChanged');
}

async function markMatchingRequirementsBound(
  service: EntityAssetRequirementService,
  entityId: string,
  role: ManageableEntityAssetBindingRole,
): Promise<void> {
  const requirements = await service.list();
  await Promise.all(
    requirements
      .filter(
        (requirement) =>
          requirement.entityId === entityId &&
          requirement.requiredKinds.includes(role) &&
          requirement.status !== 'dismissed',
      )
      .map((requirement) => service.upsert({ ...requirement, status: 'bound' })),
  );
}

async function sendRequirementToAgent(requirement: EntityAssetRequirement): Promise<void> {
  const payload: AgentContextPayload = {
    type: 'character',
    id: `entity-requirement:${requirement.id}`,
    label: `待补素材 ${requirement.entityId}`,
    summary: `需要为 ${requirement.entityKind}:${requirement.entityId} 生成 ${requirement.requiredKinds.join(', ')}`,
    data: requirement,
    intent: `请为这个实体生成 ${requirement.requiredKinds.join(', ')} 素材候选。`,
  };
  await vscode.commands.executeCommand('neko.agent.sendContext', payload);
}

function pickFirstManageableRole(
  kinds: readonly RepresentationKind[],
): ManageableEntityAssetBindingRole | undefined {
  for (const kind of kinds) {
    const role = representationKindToBindingRole(kind);
    if (role) {
      return role;
    }
  }
  return undefined;
}

function formatEntityName(entity: CreativeEntity): string {
  return entity.displayName ?? entity.canonicalName;
}

function getBindingRoleDescription(role: ManageableEntityAssetBindingRole): string {
  switch (role) {
    case 'portrait':
      return '默认立绘';
    case 'reference':
      return '默认参考图';
    case 'live2d':
      return '默认 Live2D';
    case 'live3d':
      return '默认 Live3D';
    case 'voice':
      return '默认声音';
    case 'motion':
      return '默认动作';
  }
}

function formatRequirementActionLabel(action: RequirementActionQuickPickItem['action']): string {
  switch (action) {
    case 'generate':
      return '$(sparkle) 生成素材';
    case 'import':
      return '$(add) 导入文件';
    case 'bind-existing':
      return '$(link) 绑定已有素材';
    case 'dismiss':
      return '$(close) 忽略';
  }
}
