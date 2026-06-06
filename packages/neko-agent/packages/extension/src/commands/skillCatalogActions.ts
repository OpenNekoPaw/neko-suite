import * as vscode from 'vscode';
import type {
  Skill,
  SkillCatalogActionRequest,
  SkillCatalogEditableSource,
  SkillCatalogMeta,
  SkillCatalogRef,
  SkillCatalogSource,
} from '@neko/shared';
import { isEditableSkillCatalogSource, isSkillCatalogActionRequest } from '@neko/shared';
import type { ChatViewProvider } from '../chat';
import type { SkillFileService } from '../services/SkillFileService';
import type { SkillCatalogProvider } from '../services/skillCatalogProvider';
import { getRootLogger } from '../base';

export const NEKO_AGENT_SKILL_ACTION_COMMAND = 'neko.agent.skillAction';

export interface SkillCatalogActionHostOptions {
  readonly context: vscode.ExtensionContext;
  readonly chatViewProvider: ChatViewProvider;
  readonly skillFileService: SkillFileService;
  readonly skillCatalogProvider: SkillCatalogProvider;
  readonly builtinSkills: readonly Skill[];
}

interface SkillActionResolution {
  readonly source: SkillCatalogSource;
  readonly skillName: string;
  readonly catalog?: SkillCatalogMeta;
  readonly skillFilePath?: string;
  readonly skillDirectory?: string;
  readonly builtinSkill?: Skill;
}

const SKILL_NAME_RE = /^[a-z0-9-]{1,64}$/;

export function registerSkillCatalogActionCommands(options: SkillCatalogActionHostOptions): void {
  options.context.subscriptions.push(
    vscode.commands.registerCommand(NEKO_AGENT_SKILL_ACTION_COMMAND, async (request: unknown) => {
      await executeSkillCatalogAction(request, options);
    }),
  );
}

export async function executeSkillCatalogAction(
  request: unknown,
  options: Omit<SkillCatalogActionHostOptions, 'context'>,
): Promise<void> {
  if (!isSkillCatalogActionRequest(request)) {
    throw new Error('Invalid skill action request');
  }

  const resolution = resolveSkillActionRequest(request, options);
  ensureActionAllowed(request, resolution, options);

  switch (request.action) {
    case 'run':
      await runSkill(resolution.skillName, options.chatViewProvider);
      return;
    case 'edit':
      await openSkillFile(requireSkillFilePath(resolution));
      return;
    case 'reveal':
      await revealSkillDirectory(requireSkillDirectory(resolution));
      return;
    case 'fork':
      await forkSkill(request, resolution, options);
      return;
    case 'create':
      await createSkill(request, options);
      return;
    case 'duplicate':
      await duplicateSkill(request, resolution, options);
      return;
    case 'rescan':
      await rescanSkills(options.skillFileService, options.skillCatalogProvider);
      return;
  }
}

function resolveSkillActionRequest(
  request: SkillCatalogActionRequest,
  options: Omit<SkillCatalogActionHostOptions, 'context'>,
): SkillActionResolution {
  if (request.action === 'create' || request.action === 'rescan') {
    const skillName = request.skillName?.trim() ?? '';
    return {
      source: request.targetSource ?? 'project',
      skillName,
    };
  }

  const ref = request.skillRef;
  if (!ref) {
    throw new Error(`Missing skillRef for skill action: ${request.action}`);
  }
  assertSafeSkillRef(ref);

  const entry = options.skillCatalogProvider
    .getSkills()
    .find((skill) => skill.id === ref.id && skill.catalog?.source === ref.source);
  if (!entry) {
    throw new Error(`Unknown skill catalog entry: ${ref.id}`);
  }

  const builtinSkill =
    ref.source === 'builtin'
      ? options.builtinSkills.find((skill) => skill.name === ref.id)
      : undefined;

  if (isEditableSkillCatalogSource(ref.source)) {
    const skillFilePath = options.skillFileService.getSkillFilePath(ref.id, ref.source);
    const skillDirectory = options.skillFileService.getSkillDirectory(ref.id, ref.source);
    if (!skillFilePath || !skillDirectory) {
      throw new Error(`Unable to resolve skill path: ${ref.id}`);
    }
    return {
      source: ref.source,
      skillName: ref.id,
      catalog: entry.catalog,
      skillFilePath,
      skillDirectory,
      builtinSkill,
    };
  }

  return {
    source: ref.source,
    skillName: ref.id,
    catalog: entry.catalog,
    builtinSkill,
  };
}

function ensureActionAllowed(
  request: SkillCatalogActionRequest,
  resolution: SkillActionResolution,
  options: Omit<SkillCatalogActionHostOptions, 'context'>,
): void {
  if (request.action === 'create' || request.action === 'rescan') {
    return;
  }

  const entry = options.skillCatalogProvider
    .getSkills()
    .find(
      (skill) => skill.id === resolution.skillName && skill.catalog?.source === resolution.source,
    );
  const actionAllowed = entry?.catalog?.actions.some((action) => action.id === request.action);
  if (!actionAllowed) {
    throw new Error(`Unsupported skill action "${request.action}" for ${resolution.skillName}`);
  }

  if (
    (request.action === 'edit' || request.action === 'reveal' || request.action === 'duplicate') &&
    !isEditableSkillCatalogSource(resolution.source)
  ) {
    throw new Error(`Skill action "${request.action}" requires an editable file skill`);
  }
}

async function runSkill(skillName: string, chatViewProvider: ChatViewProvider): Promise<void> {
  await vscode.commands.executeCommand('neko.aiAssistant.focus');
  await chatViewProvider.sendMessageToAssistant(`/${skillName}`, true);
}

async function openSkillFile(skillFilePath: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(skillFilePath);
  await vscode.window.showTextDocument(document, { preview: false });
}

async function revealSkillDirectory(skillDirectory: string): Promise<void> {
  await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(skillDirectory));
}

async function forkSkill(
  request: SkillCatalogActionRequest,
  resolution: SkillActionResolution,
  options: Omit<SkillCatalogActionHostOptions, 'context'>,
): Promise<void> {
  const builtin = resolution.builtinSkill;
  if (!builtin) {
    throw new Error(`Only built-in skills can be forked: ${resolution.skillName}`);
  }
  const targetSource = request.targetSource ?? 'project';
  assertEditableTargetSource(targetSource);
  const filePath = await options.skillFileService.createSkillFile(
    builtin.name,
    targetSource,
    builtin.content,
    builtin.description,
  );
  await options.skillFileService.writeSkillManifest(builtin.name, targetSource, {
    version: builtin.version,
    domain: builtin.domain,
    requiredSubpackages: builtin.requiredSubpackages,
    autoInvoke: builtin.autoInvoke,
    referencedAssets: builtin.referencedAssets,
    referencedSkills: builtin.referencedSkills,
    mediaWorkflow: builtin.mediaWorkflow,
    compliance: builtin.compliance,
    catalog: {
      role: resolution.catalog?.role ?? builtin.catalog?.role ?? 'standalone',
      groupId: resolution.catalog?.groupId ?? builtin.catalog?.groupId,
      parentSkillIds: resolution.catalog?.parentSkillIds ?? builtin.catalog?.parentSkillIds,
      visibility: resolution.catalog?.visibility ?? builtin.catalog?.visibility,
      editable: true,
      actions: ['run', 'edit', 'reveal', 'duplicate'],
    },
  });
  await rescanSkills(options.skillFileService, options.skillCatalogProvider);
  await openSkillFile(filePath);
}

async function createSkill(
  request: SkillCatalogActionRequest,
  options: Omit<SkillCatalogActionHostOptions, 'context'>,
): Promise<void> {
  const targetSource = request.targetSource ?? 'project';
  assertEditableTargetSource(targetSource);
  const skillName = request.skillName?.trim();
  if (!skillName || !SKILL_NAME_RE.test(skillName)) {
    throw new Error('Skill name must contain only lowercase letters, numbers, and hyphens');
  }
  const filePath = await options.skillFileService.createSkillFile(skillName, targetSource);
  await rescanSkills(options.skillFileService, options.skillCatalogProvider);
  await openSkillFile(filePath);
}

async function duplicateSkill(
  request: SkillCatalogActionRequest,
  resolution: SkillActionResolution,
  options: Omit<SkillCatalogActionHostOptions, 'context'>,
): Promise<void> {
  const targetSource = request.targetSource ?? resolution.source;
  assertEditableTargetSource(targetSource);
  const newSkillName = request.skillName?.trim();
  if (!newSkillName || !SKILL_NAME_RE.test(newSkillName)) {
    throw new Error('Skill name must contain only lowercase letters, numbers, and hyphens');
  }
  const newSkillDir = await options.skillFileService.duplicateSkillDirectory(
    requireSkillDirectory(resolution),
    newSkillName,
    targetSource,
  );
  await rescanSkills(options.skillFileService, options.skillCatalogProvider);
  await openSkillFile(`${newSkillDir}/SKILL.md`);
}

async function rescanSkills(
  skillFileService: SkillFileService,
  skillCatalogProvider: SkillCatalogProvider,
): Promise<void> {
  await skillFileService.triggerRescan();
  const result = await skillFileService.getSkills();
  skillCatalogProvider.updateScanResult(result);
}

function assertSafeSkillRef(ref: SkillCatalogRef): void {
  if (!SKILL_NAME_RE.test(ref.id)) {
    throw new Error('Invalid skill id');
  }
  if (ref.extensionId !== 'neko.neko-agent') {
    throw new Error(`Unsupported skill provider: ${ref.extensionId}`);
  }
}

function assertEditableTargetSource(
  source: SkillCatalogSource,
): asserts source is SkillCatalogEditableSource {
  if (!isEditableSkillCatalogSource(source)) {
    throw new Error(`Unsupported target source: ${source}`);
  }
}

function requireSkillFilePath(resolution: SkillActionResolution): string {
  if (!resolution.skillFilePath) {
    throw new Error(`Skill file path is unavailable: ${resolution.skillName}`);
  }
  return resolution.skillFilePath;
}

function requireSkillDirectory(resolution: SkillActionResolution): string {
  if (!resolution.skillDirectory) {
    throw new Error(`Skill directory is unavailable: ${resolution.skillName}`);
  }
  return resolution.skillDirectory;
}

export function logSkillActionError(error: unknown): void {
  getRootLogger().warn('Skill catalog action failed', { error });
}
