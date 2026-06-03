import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PHONEME_ROTATIONS, type Phoneme } from '../../types/boneExpression';
import type { SceneNodeSnapshot } from '../../types';
import type { EditableNodeTransform } from '../../scene/SceneEditingTypes';
import { useTranslation } from '../../i18n/I18nContext';
import {
  disabledControl,
  formatControlAvailabilityTitle,
  isControlDisabled,
  type ModelControlAvailability,
} from '../../baseline/controlAvailability';

const PHONEMES: Phoneme[] = ['A', 'I', 'U', 'E', 'O', 'silent'];
const HUMANOID_JOINT_TERMS = [
  'hips',
  'pelvis',
  'spine',
  'chest',
  'neck',
  'head',
  'jaw',
  'eye',
  'brow',
  'eyebrow',
  'shoulder',
  'clavicle',
  'arm',
  'forearm',
  'elbow',
  'wrist',
  'hand',
  'thumb',
  'index',
  'middle',
  'ring',
  'little',
  'leg',
  'upleg',
  'knee',
  'calf',
  'ankle',
  'foot',
  'toe',
];
const DEFAULT_JOINT_PRIORITY = ['hips', 'spine', 'chest', 'neck', 'head'];

type QuatTuple = [number, number, number, number];
type EulerTuple = [number, number, number];

interface JointCandidate {
  nodeId: string;
  label: string;
  depth: number;
  transform: EditableNodeTransform;
  searchKey: string;
}

interface BoneExpressionPanelProps {
  characterId: string | null;
  sceneNodes: readonly SceneNodeSnapshot[];
  selectedNodeId: string | null;
  disabled?: boolean;
  availability?: ModelControlAvailability;
  onSetBonePose: (boneId: string, rotation: QuatTuple) => void;
  onSetJointTransform: (nodeId: string, transform: EditableNodeTransform) => void | Promise<void>;
  onSelectJoint?: (nodeId: string) => void;
}

/**
 * Bone Expression Panel - lip sync, eye tracking, expression pose, and live joint transforms.
 */
export function BoneExpressionPanel({
  characterId,
  sceneNodes,
  selectedNodeId,
  disabled = false,
  availability,
  onSetBonePose,
  onSetJointTransform,
  onSelectJoint,
}: BoneExpressionPanelProps): React.JSX.Element {
  const [activePhoneme, setActivePhoneme] = useState<Phoneme>('silent');
  const [eyebrowRaise, setEyebrowRaise] = useState(0);
  const [eyebrowLower, setEyebrowLower] = useState(0);
  const [eyebrowFurrow, setEyebrowFurrow] = useState(0);
  const [manualBoneId, setManualBoneId] = useState('hips');
  const [manualRotation, setManualRotation] = useState<QuatTuple>([0, 0, 0, 1]);
  const [selectedJointId, setSelectedJointId] = useState<string | null>(null);
  const [jointEulerDeg, setJointEulerDeg] = useState<EulerTuple>([0, 0, 0]);
  const eyeTrackRef = useRef<HTMLDivElement>(null);

  const { t } = useTranslation();
  const jointCandidates = useMemo(() => buildJointCandidates(sceneNodes), [sceneNodes]);
  const selectedJoint =
    jointCandidates.find((candidate) => candidate.nodeId === selectedJointId) ?? null;
  const effectiveAvailability =
    availability ?? (!characterId ? disabledControl('asset-not-character') : null);
  const controlsDisabled =
    disabled || (effectiveAvailability ? isControlDisabled(effectiveAvailability) : false);
  const characterCommandDisabled = controlsDisabled || !characterId;
  const jointControlsDisabled = controlsDisabled || !selectedJoint;
  const availabilityTitle = (baseTitle: string) =>
    formatControlAvailabilityTitle(effectiveAvailability ?? { state: 'available' }, t, baseTitle);

  useEffect(() => {
    const nextJointId = chooseInitialJointId(jointCandidates, selectedNodeId);
    setSelectedJointId((current) =>
      current && jointCandidates.some((candidate) => candidate.nodeId === current)
        ? current
        : nextJointId,
    );
  }, [jointCandidates, selectedNodeId]);

  useEffect(() => {
    if (!selectedJoint) {
      setJointEulerDeg([0, 0, 0]);
      return;
    }
    setJointEulerDeg(quaternionToEulerDegrees(transformRotationTuple(selectedJoint.transform)));
  }, [selectedJoint]);

  const commitJointRotation = useCallback(
    (joint: JointCandidate, rotation: QuatTuple) => {
      const nextTransform: EditableNodeTransform = {
        position: { ...joint.transform.position },
        rotation: {
          x: rotation[0],
          y: rotation[1],
          z: rotation[2],
          w: rotation[3],
        },
        scale: { ...joint.transform.scale },
      };
      void onSetJointTransform(joint.nodeId, nextTransform);
    },
    [onSetJointTransform],
  );

  const applyJointRotationByAlias = useCallback(
    (aliases: readonly string[], rotation: QuatTuple) => {
      const joint = findJointByAlias(jointCandidates, aliases);
      if (!joint) return;
      commitJointRotation(joint, rotation);
    },
    [commitJointRotation, jointCandidates],
  );

  const handlePhonemeClick = useCallback(
    (phoneme: Phoneme) => {
      if (disabled) return;
      setActivePhoneme(phoneme);
      const rot = PHONEME_ROTATIONS[phoneme];
      if (!characterCommandDisabled) {
        onSetBonePose('jaw', rot.jaw);
      }
      applyJointRotationByAlias(['jaw'], rot.jaw);
    },
    [applyJointRotationByAlias, characterCommandDisabled, disabled, onSetBonePose],
  );

  const handleEyeTrack = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = eyeTrackRef.current?.getBoundingClientRect();
      if (!rect || disabled) return;

      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      const maxAngle = 0.13;
      const qx = -y * maxAngle;
      const qy = x * maxAngle;
      const qw = Math.sqrt(Math.max(0, 1 - qx * qx - qy * qy));
      const rotation: QuatTuple = normalizeQuaternion([qx, qy, 0, qw]);

      if (!characterCommandDisabled) {
        onSetBonePose('leftEye', rotation);
        onSetBonePose('rightEye', rotation);
      }
      applyJointRotationByAlias(['lefteye', 'eye.l', 'left_eye'], rotation);
      applyJointRotationByAlias(['righteye', 'eye.r', 'right_eye'], rotation);
    },
    [applyJointRotationByAlias, characterCommandDisabled, disabled, onSetBonePose],
  );

  const handleEyebrowChange = useCallback(
    (param: 'raise' | 'lower' | 'furrow', value: number) => {
      if (disabled) return;
      switch (param) {
        case 'raise':
          setEyebrowRaise(value);
          break;
        case 'lower':
          setEyebrowLower(value);
          break;
        case 'furrow':
          setEyebrowFurrow(value);
          break;
      }

      const angle = value * 0.1;
      const rotation: QuatTuple = normalizeQuaternion([angle, 0, 0, Math.sqrt(1 - angle * angle)]);
      const leftFurrow: QuatTuple = normalizeQuaternion([
        angle,
        0,
        angle * 0.5,
        Math.sqrt(1 - angle * angle),
      ]);
      const rightFurrow: QuatTuple = normalizeQuaternion([
        angle,
        0,
        -angle * 0.5,
        Math.sqrt(1 - angle * angle),
      ]);

      if (!characterCommandDisabled) {
        if (param === 'raise' || param === 'lower') {
          onSetBonePose('leftEyebrow', rotation);
          onSetBonePose('rightEyebrow', rotation);
        } else {
          onSetBonePose('leftEyebrow', leftFurrow);
          onSetBonePose('rightEyebrow', rightFurrow);
        }
      }

      if (param === 'raise' || param === 'lower') {
        applyJointRotationByAlias(['lefteyebrow', 'leftbrow', 'brow.l'], rotation);
        applyJointRotationByAlias(['righteyebrow', 'rightbrow', 'brow.r'], rotation);
      } else {
        applyJointRotationByAlias(['lefteyebrow', 'leftbrow', 'brow.l'], leftFurrow);
        applyJointRotationByAlias(['righteyebrow', 'rightbrow', 'brow.r'], rightFurrow);
      }
    },
    [applyJointRotationByAlias, characterCommandDisabled, disabled, onSetBonePose],
  );

  const handleJointSelect = useCallback(
    (nodeId: string) => {
      setSelectedJointId(nodeId);
      onSelectJoint?.(nodeId);
    },
    [onSelectJoint],
  );

  const handleJointEulerChange = useCallback(
    (axis: 0 | 1 | 2, value: number) => {
      if (!selectedJoint || jointControlsDisabled) return;
      const next: EulerTuple = [...jointEulerDeg];
      next[axis] = value;
      setJointEulerDeg(next);
      commitJointRotation(selectedJoint, eulerDegreesToQuaternion(next));
    },
    [commitJointRotation, jointControlsDisabled, jointEulerDeg, selectedJoint],
  );

  return (
    <div className="model-side-panel h-full w-64">
      <div className="model-panel-header">
        <h2 className="model-title">{t('bone.title')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="model-panel-section">
          <div className="model-section-title mb-2">{t('bone.jointTransform')}</div>
          <label className="mb-2 block text-[10px] text-[var(--model-fg-secondary)]">
            {t('bone.jointNode')}
            <select
              className="model-input mt-1 w-full px-2 py-1 text-xs"
              value={selectedJoint?.nodeId ?? ''}
              disabled={controlsDisabled || jointCandidates.length === 0}
              title={availabilityTitle(t('bone.jointNode'))}
              onChange={(event) => handleJointSelect(event.currentTarget.value)}
            >
              {jointCandidates.length === 0 ? (
                <option value="">{t('bone.noJointNodes')}</option>
              ) : (
                jointCandidates.map((joint) => (
                  <option key={joint.nodeId} value={joint.nodeId}>
                    {formatJointLabel(joint)}
                  </option>
                ))
              )}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-1">
            {(['X', 'Y', 'Z'] as const).map((axis, index) => (
              <DegreeField
                key={axis}
                label={axis}
                value={jointEulerDeg[index] ?? 0}
                disabled={jointControlsDisabled}
                onChange={(value) => handleJointEulerChange(index as 0 | 1 | 2, value)}
              />
            ))}
          </div>
        </div>

        <div className="model-panel-section">
          <div className="model-section-title mb-2">{t('bone.lipSync')}</div>
          <div className="grid grid-cols-3 gap-1">
            {PHONEMES.map((phoneme) => (
              <button
                key={phoneme}
                onClick={() => handlePhonemeClick(phoneme)}
                disabled={controlsDisabled}
                title={availabilityTitle(phoneme === 'silent' ? t('bone.lipSync') : phoneme)}
                className={`${activePhoneme === phoneme ? 'model-btn-primary' : 'model-btn-secondary'} px-2 py-1.5 text-xs ${
                  activePhoneme === phoneme ? '' : ''
                }`}
              >
                {phoneme === 'silent' ? '\u2014' : phoneme}
              </button>
            ))}
          </div>
        </div>

        <div className="model-panel-section">
          <div className="model-section-title mb-2">{t('bone.eyeTracking')}</div>
          <div
            ref={eyeTrackRef}
            onMouseMove={handleEyeTrack}
            className={`relative mx-auto h-32 w-32 rounded-lg border border-[var(--model-input-border)] bg-[var(--model-input-bg)] ${
              controlsDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'
            }`}
            title={availabilityTitle(t('bone.eyeTracking'))}
          >
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-px w-full bg-[var(--model-fg-muted)] opacity-60" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-full w-px bg-[var(--model-fg-muted)] opacity-60" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[10px] text-[var(--model-fg-secondary)] opacity-70">
                {t('bone.moveMouse')}
              </span>
            </div>
          </div>
        </div>

        <div className="px-3 py-2">
          <div className="model-section-title mb-2">{t('bone.eyebrow')}</div>
          <EyebrowSlider
            label={t('bone.raise')}
            value={eyebrowRaise}
            onChange={(value) => handleEyebrowChange('raise', value)}
            disabled={controlsDisabled}
          />
          <EyebrowSlider
            label={t('bone.lower')}
            value={eyebrowLower}
            onChange={(value) => handleEyebrowChange('lower', value)}
            disabled={controlsDisabled}
          />
          <EyebrowSlider
            label={t('bone.furrow')}
            value={eyebrowFurrow}
            onChange={(value) => handleEyebrowChange('furrow', value)}
            disabled={controlsDisabled}
          />
        </div>

        <div className="model-panel-section">
          <div className="model-section-title mb-2">{t('bone.poseEdit')}</div>
          <label className="mb-2 block text-[10px] text-[var(--model-fg-secondary)]">
            {t('bone.boneId')}
            <input
              className="model-input mt-1 w-full px-2 py-1 text-xs"
              value={manualBoneId}
              disabled={characterCommandDisabled}
              onChange={(event) => setManualBoneId(event.currentTarget.value)}
            />
          </label>
          <div className="grid grid-cols-4 gap-1">
            {(['x', 'y', 'z', 'w'] as const).map((axis, index) => (
              <QuaternionField
                key={axis}
                label={axis.toUpperCase()}
                value={manualRotation[index] ?? 0}
                disabled={characterCommandDisabled}
                onChange={(value) =>
                  setManualRotation((rotation) => {
                    const next: QuatTuple = [...rotation];
                    next[index] = value;
                    return next;
                  })
                }
              />
            ))}
          </div>
          <button
            className="model-btn-primary mt-2 w-full px-2 py-1 text-xs"
            disabled={characterCommandDisabled || manualBoneId.trim().length === 0}
            title={availabilityTitle(t('bone.applyPose'))}
            onClick={() => onSetBonePose(manualBoneId.trim(), normalizeQuaternion(manualRotation))}
          >
            {t('bone.applyPose')}
          </button>
        </div>
      </div>
      {effectiveAvailability && effectiveAvailability.state !== 'available' ? (
        <div
          className="model-panel-footer text-[10px] text-[var(--model-fg-secondary)]"
          data-availability-state={effectiveAvailability.state}
          data-availability-reason={effectiveAvailability.reason}
        >
          {formatControlAvailabilityTitle(effectiveAvailability, t)}
        </div>
      ) : null}
    </div>
  );
}

function DegreeField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}): React.JSX.Element {
  return (
    <label className="text-[10px] text-[var(--model-fg-secondary)]">
      {label}
      <input
        type="number"
        min={-180}
        max={180}
        step={1}
        value={Number.isFinite(value) ? value.toFixed(0) : '0'}
        disabled={disabled}
        onChange={(event) => onChange(clampDegrees(Number.parseFloat(event.currentTarget.value)))}
        className="model-input mt-1 w-full px-1 py-0.5 text-center text-[10px]"
      />
    </label>
  );
}

function QuaternionField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}): React.JSX.Element {
  return (
    <label className="text-[10px] text-[var(--model-fg-secondary)]">
      {label}
      <input
        type="number"
        step={0.001}
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        onChange={(event) => onChange(Number.parseFloat(event.currentTarget.value) || 0)}
        className="model-input mt-1 w-full px-1 py-0.5 text-center text-[10px]"
      />
    </label>
  );
}

function EyebrowSlider({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="w-10 shrink-0 text-[10px] text-[var(--model-fg-secondary)]">{label}</span>
      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(parseFloat(event.target.value))}
        disabled={disabled}
        className="model-range flex-1"
      />
      <span className="w-8 text-right text-[10px] text-[var(--model-fg-secondary)]">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

function buildJointCandidates(nodes: readonly SceneNodeSnapshot[]): JointCandidate[] {
  const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]));
  return nodes
    .filter((node) => isJointCandidate(node))
    .map((node) => {
      const depth = nodeDepth(node, nodeMap);
      return {
        nodeId: node.nodeId,
        label: node.name || node.nodeId,
        depth,
        transform: toEditableTransform(node),
        searchKey: normalizeJointKey(`${node.name} ${node.nodeId}`),
      };
    })
    .sort((left, right) => left.depth - right.depth || left.label.localeCompare(right.label));
}

function isJointCandidate(node: SceneNodeSnapshot): boolean {
  const kind = node.kind ?? 'node';
  if (kind === 'bone' || kind === 'skeleton') return true;
  if (kind === 'mesh' || kind === 'light' || kind === 'camera') return false;
  if (node.mesh || node.material) return false;

  const key = normalizeJointKey(`${node.name} ${node.nodeId}`);
  return (
    HUMANOID_JOINT_TERMS.some((term) => key.includes(term)) || (node.children?.length ?? 0) > 0
  );
}

function chooseInitialJointId(
  candidates: readonly JointCandidate[],
  selectedNodeId: string | null,
): string | null {
  if (selectedNodeId && candidates.some((candidate) => candidate.nodeId === selectedNodeId)) {
    return selectedNodeId;
  }
  for (const term of DEFAULT_JOINT_PRIORITY) {
    const candidate = findJointByAlias(candidates, [term]);
    if (candidate) return candidate.nodeId;
  }
  return candidates[0]?.nodeId ?? null;
}

function findJointByAlias(
  candidates: readonly JointCandidate[],
  aliases: readonly string[],
): JointCandidate | null {
  const normalizedAliases = aliases.map(normalizeJointKey).filter((alias) => alias.length > 0);
  return (
    candidates.find((candidate) =>
      normalizedAliases.some((alias) => candidate.searchKey.includes(alias)),
    ) ?? null
  );
}

function formatJointLabel(joint: JointCandidate): string {
  const prefix = joint.depth > 0 ? `${'  '.repeat(Math.min(joint.depth, 6))}` : '';
  return `${prefix}${joint.label}`;
}

function nodeDepth(
  node: SceneNodeSnapshot,
  nodeMap: ReadonlyMap<string, SceneNodeSnapshot>,
): number {
  let depth = 0;
  let current = node.parentId ? nodeMap.get(node.parentId) : undefined;
  const visited = new Set<string>([node.nodeId]);
  while (current && !visited.has(current.nodeId)) {
    visited.add(current.nodeId);
    depth += 1;
    current = current.parentId ? nodeMap.get(current.parentId) : undefined;
  }
  return depth;
}

function toEditableTransform(node: SceneNodeSnapshot): EditableNodeTransform {
  return {
    position: {
      x: node.transform?.position?.x ?? 0,
      y: node.transform?.position?.y ?? 0,
      z: node.transform?.position?.z ?? 0,
    },
    rotation: {
      x: node.transform?.rotation?.x ?? 0,
      y: node.transform?.rotation?.y ?? 0,
      z: node.transform?.rotation?.z ?? 0,
      w: node.transform?.rotation?.w ?? 1,
    },
    scale: {
      x: node.transform?.scale?.x ?? 1,
      y: node.transform?.scale?.y ?? 1,
      z: node.transform?.scale?.z ?? 1,
    },
  };
}

function transformRotationTuple(transform: EditableNodeTransform): QuatTuple {
  return normalizeQuaternion([
    transform.rotation.x,
    transform.rotation.y,
    transform.rotation.z,
    transform.rotation.w,
  ]);
}

function eulerDegreesToQuaternion(eulerDeg: EulerTuple): QuatTuple {
  const x = (eulerDeg[0] * Math.PI) / 360;
  const y = (eulerDeg[1] * Math.PI) / 360;
  const z = (eulerDeg[2] * Math.PI) / 360;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  return normalizeQuaternion([
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ]);
}

function quaternionToEulerDegrees(rotation: QuatTuple): EulerTuple {
  const [x, y, z, w] = normalizeQuaternion(rotation);
  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);

  const sinp = 2 * (w * y - z * x);
  const pitch =
    Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(clampNumber(sinp, -1, 1));

  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);

  return [
    clampDegrees((roll * 180) / Math.PI),
    clampDegrees((pitch * 180) / Math.PI),
    clampDegrees((yaw * 180) / Math.PI),
  ];
}

function normalizeQuaternion(rotation: QuatTuple): QuatTuple {
  const length = Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3]);
  if (!Number.isFinite(length) || length <= 0.000001) {
    return [0, 0, 0, 1];
  }
  return [rotation[0] / length, rotation[1] / length, rotation[2] / length, rotation[3] / length];
}

function normalizeJointKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function clampDegrees(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clampNumber(value, -180, 180);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
