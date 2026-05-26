/**
 * ParameterPanel - interactive sliders for puppet parameters
 *
 * Displays all parameters from the loaded puppet with min/max/current values.
 * Preview changes update local UI state only; commits are sent to the engine backend.
 */
import { useCallback, useMemo } from 'react';
import { PropertyPanel as SharedPropertyPanel } from '@neko/ui/creative';
import type { PropertyValue } from '@neko/ui/creative';
import { usePuppetStore } from '../stores/puppet-store';
import { useTranslation } from '../i18n/I18nContext';
import { PUPPET_FACE_PARAMETERS } from '@neko/shared';
import type { IPuppetController } from '../animation';
import type { PuppetSceneController } from '../viewport/PuppetSceneController';
import {
  mapNativeBlendShapesToProperties,
  mapPuppetFaceParametersToProperties,
  mapPuppetParametersToProperties,
} from './adapters/sharedPuppetUiAdapter';

interface ParameterPanelProps {
  controller: IPuppetController | null;
  sceneController?: PuppetSceneController | null;
}

export function ParameterPanel({ controller, sceneController }: ParameterPanelProps) {
  const { t } = useTranslation();
  const puppetLoaded = usePuppetStore((s) => s.puppetLoaded);
  const parameters = usePuppetStore((s) => s.puppetParameters);
  const nativeBlendShapes = usePuppetStore((s) => s.nativeBlendShapes);
  const updateParameterValue = usePuppetStore((s) => s.updateParameterValue);
  const updateNativeBlendShapeWeight = usePuppetStore((s) => s.updateNativeBlendShapeWeight);

  const handleParameterPreview = useCallback(
    (name: string, value: number) => {
      updateParameterValue(name, value);
    },
    [updateParameterValue],
  );

  const handleParameterCommit = useCallback(
    (name: string, value: number) => {
      updateParameterValue(name, value);
      void controller?.setParameter(name, value);
    },
    [controller, updateParameterValue],
  );

  const handleNativeBlendShapePreview = useCallback(
    (name: string, value: number) => {
      updateNativeBlendShapeWeight(name, value);
    },
    [updateNativeBlendShapeWeight],
  );

  const handleNativeBlendShapeCommit = useCallback(
    (name: string, value: number) => {
      void sceneController
        ?.setBlendShape(name, value)
        .then(async (event) => {
          if (event.status === 'error') return;
          const meshes = await controller?.getMeshes();
          if (!meshes) return;
          usePuppetStore.getState().setDeformedMeshes(meshes);
        })
        .catch(() => {
          void controller?.getMeshes().then((meshes) => {
            usePuppetStore.getState().setDeformedMeshes(meshes);
          });
        });
    },
    [controller, sceneController],
  );

  const handleParameterValue = useCallback(
    (propertyId: string, value: PropertyValue, handler: (name: string, value: number) => void) => {
      if (typeof value === 'number') {
        handler(propertyId, value);
      }
    },
    [],
  );

  // Check if any puppet parameters match the standard face parameter template
  const hasFaceParams = useMemo(() => {
    const faceNames = new Set(PUPPET_FACE_PARAMETERS.map((p) => p.name));
    return parameters.some((p) => faceNames.has(p.name));
  }, [parameters]);
  const locale = t('puppet.panel.parameters') !== 'puppet.panel.parameters' ? 'zh' : 'en';
  const parameterAdapter = useMemo(
    () =>
      hasFaceParams
        ? mapPuppetFaceParametersToProperties(parameters, locale)
        : mapPuppetParametersToProperties(parameters),
    [hasFaceParams, locale, parameters],
  );
  const nativeBlendShapeAdapter = useMemo(
    () => mapNativeBlendShapesToProperties(nativeBlendShapes),
    [nativeBlendShapes],
  );

  if (!puppetLoaded || (parameters.length === 0 && nativeBlendShapes.length === 0)) return null;

  return (
    <div className="sketch-panel" role="region" aria-label={t('puppet.panel.parameters')}>
      <h3 className="sketch-panel-title m-0 mb-1">{t('puppet.panel.parameters')}</h3>

      {nativeBlendShapes.length > 0 && (
        <div className="mb-2">
          <SharedPropertyPanel
            groups={nativeBlendShapeAdapter.groups}
            onCommit={(propertyId, value) => {
              const shape = nativeBlendShapes.find(
                (item) => `${item.meshId}:${item.name}` === propertyId,
              );
              if (shape) {
                handleParameterValue(shape.name, value, handleNativeBlendShapeCommit);
              }
            }}
            onPreviewChange={(propertyId, value) => {
              const shape = nativeBlendShapes.find(
                (item) => `${item.meshId}:${item.name}` === propertyId,
              );
              if (shape) {
                handleParameterValue(shape.name, value, handleNativeBlendShapePreview);
              }
            }}
            onReset={(propertyId) => {
              const shape = nativeBlendShapes.find(
                (item) => `${item.meshId}:${item.name}` === propertyId,
              );
              if (shape) {
                handleNativeBlendShapeCommit(shape.name, 0);
              }
            }}
            properties={nativeBlendShapeAdapter.properties}
          />
        </div>
      )}

      {parameters.length > 0 ? (
        <SharedPropertyPanel
          groups={parameterAdapter.groups}
          onCommit={(propertyId, value) =>
            handleParameterValue(propertyId, value, handleParameterCommit)
          }
          onPreviewChange={(propertyId, value) =>
            handleParameterValue(propertyId, value, handleParameterPreview)
          }
          onReset={(propertyId) => {
            const parameter = parameters.find((item) => item.name === propertyId);
            if (parameter) {
              handleParameterCommit(parameter.name, parameter.default);
            }
          }}
          properties={parameterAdapter.properties}
        />
      ) : null}
    </div>
  );
}
