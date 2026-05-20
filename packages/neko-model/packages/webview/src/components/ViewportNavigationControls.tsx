import React, { useCallback, useEffect, useRef } from 'react';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  RefreshIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@neko/shared/icons';
import { useTranslation } from '../i18n/I18nContext';
import { useModelStore } from '../stores/modelStore';

export interface ViewportNavigationControlsProps {
  viewportId?: string;
  onCameraChange?: () => void;
  onCameraMutated?: () => void;
}

const CAMERA_SEND_INTERVAL_MS = 16;
const BUTTON_ZOOM_STEP = 0.1;
const BUTTON_PAN_STEP = 0.05;
const BUTTON_ORBIT_STEP = Math.PI / 16;
const MIN_BUTTON_ZOOM_STEP = 0.005;
const MIN_BUTTON_PAN_STEP = 0.002;

export function ViewportNavigationControls({
  onCameraChange,
  onCameraMutated,
}: ViewportNavigationControlsProps): React.JSX.Element {
  const { t } = useTranslation();
  const lastSendRef = useRef(0);
  const pendingSendRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRadius = useModelStore((state) => state.cameraRadius);
  const showViewportGrid = useModelStore((state) => state.showViewportGrid);

  useEffect(() => {
    return () => {
      if (pendingSendRef.current !== null) {
        clearTimeout(pendingSendRef.current);
        pendingSendRef.current = null;
      }
    };
  }, []);

  const sendCamera = useCallback(() => {
    onCameraChange?.();
  }, [onCameraChange]);

  const queueCameraSend = useCallback(() => {
    const now = Date.now();
    if (now - lastSendRef.current >= CAMERA_SEND_INTERVAL_MS) {
      lastSendRef.current = now;
      sendCamera();
      return;
    }
    if (pendingSendRef.current !== null) return;

    pendingSendRef.current = setTimeout(
      () => {
        pendingSendRef.current = null;
        lastSendRef.current = Date.now();
        sendCamera();
      },
      CAMERA_SEND_INTERVAL_MS - (now - lastSendRef.current),
    );
  }, [sendCamera]);

  const runCameraAction = useCallback(
    (action: () => void) => {
      action();
      onCameraMutated?.();
      queueCameraSend();
    },
    [onCameraMutated, queueCameraSend],
  );

  const zoomStep = Math.max(MIN_BUTTON_ZOOM_STEP, cameraRadius * BUTTON_ZOOM_STEP);
  const panStep = Math.max(MIN_BUTTON_PAN_STEP, cameraRadius * BUTTON_PAN_STEP);

  return (
    <div className="model-viewport-nav-controls" aria-label={t('viewport.controls')}>
      <div className="model-viewport-nav-group">
        <ViewportNavButton
          label={t('viewport.zoomIn')}
          onClick={() => runCameraAction(() => useModelStore.getState().zoomCamera(-zoomStep))}
        >
          <ZoomInIcon size={18} />
        </ViewportNavButton>
        <ViewportNavButton
          label={t('viewport.zoomOut')}
          onClick={() => runCameraAction(() => useModelStore.getState().zoomCamera(zoomStep))}
        >
          <ZoomOutIcon size={18} />
        </ViewportNavButton>
      </div>

      <div className="model-viewport-nav-pad" aria-label={t('viewport.pan')}>
        <ViewportNavButton
          label={t('viewport.panUp')}
          className="model-viewport-nav-pad-up"
          onClick={() => runCameraAction(() => useModelStore.getState().panCamera(0, panStep))}
        >
          <ChevronUpIcon size={16} />
        </ViewportNavButton>
        <ViewportNavButton
          label={t('viewport.panLeft')}
          className="model-viewport-nav-pad-left"
          onClick={() => runCameraAction(() => useModelStore.getState().panCamera(-panStep, 0))}
        >
          <ChevronLeftIcon size={16} />
        </ViewportNavButton>
        <span className="model-viewport-nav-pad-center" aria-hidden="true" />
        <ViewportNavButton
          label={t('viewport.panRight')}
          className="model-viewport-nav-pad-right"
          onClick={() => runCameraAction(() => useModelStore.getState().panCamera(panStep, 0))}
        >
          <ChevronRightIcon size={16} />
        </ViewportNavButton>
        <ViewportNavButton
          label={t('viewport.panDown')}
          className="model-viewport-nav-pad-down"
          onClick={() => runCameraAction(() => useModelStore.getState().panCamera(0, -panStep))}
        >
          <ChevronDownIcon size={16} />
        </ViewportNavButton>
      </div>

      <div className="model-viewport-nav-group">
        <ViewportNavButton
          label={t('viewport.orbit')}
          onClick={() =>
            runCameraAction(() => useModelStore.getState().orbitCamera(BUTTON_ORBIT_STEP, 0))
          }
        >
          <OrbitIcon />
        </ViewportNavButton>
        <ViewportNavButton
          label={t('viewport.grid')}
          pressed={showViewportGrid}
          onClick={() => useModelStore.getState().toggleViewportGrid()}
        >
          <GridIcon />
        </ViewportNavButton>
        <ViewportNavButton
          label={t('viewport.resetCamera')}
          onClick={() => runCameraAction(() => useModelStore.getState().resetCamera())}
        >
          <RefreshIcon size={17} />
        </ViewportNavButton>
      </div>
    </div>
  );
}

interface ViewportNavButtonProps {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  pressed?: boolean;
}

function ViewportNavButton({
  label,
  children,
  onClick,
  className,
  pressed,
}: ViewportNavButtonProps): React.JSX.Element {
  const classes = ['model-viewport-nav-btn', pressed ? 'active' : null, className ?? null]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function OrbitIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <path d="M4 12a8 8 0 0 1 13.66-5.66" />
        <path d="M18 3v4h-4" />
        <path d="M20 12a8 8 0 0 1-13.66 5.66" />
        <path d="M6 21v-4h4" />
      </g>
    </svg>
  );
}

function GridIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        <path d="M4 4h16v16H4z" />
        <path d="M4 10h16" />
        <path d="M4 16h16" />
        <path d="M10 4v16" />
        <path d="M16 4v16" />
      </g>
    </svg>
  );
}
