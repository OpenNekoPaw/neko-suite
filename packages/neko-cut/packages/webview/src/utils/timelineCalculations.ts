/**
 * Timeline Calculation Utilities
 * 时间轴计算工具函数
 */

import { PIXELS_PER_SECOND } from '../constants';

/**
 * 将时间(秒)转换为像素位置
 */
export function timeToPixels(time: number, zoomLevel: number): number {
  return time * PIXELS_PER_SECOND * zoomLevel;
}

/**
 * 将像素位置转换为时间(秒)
 */
export function pixelsToTime(pixels: number, zoomLevel: number): number {
  return pixels / (PIXELS_PER_SECOND * zoomLevel);
}

/**
 * 计算时间标记间隔
 * 根据缩放级别动态调整标记密度
 */
export function calculateTimeMarkerInterval(zoomLevel: number): number {
  if (zoomLevel >= 4) return 1; // 每秒一个标记
  if (zoomLevel >= 2) return 2; // 每2秒一个标记
  if (zoomLevel >= 1) return 5; // 每5秒一个标记
  if (zoomLevel >= 0.5) return 10; // 每10秒一个标记
  if (zoomLevel >= 0.25) return 30; // 每30秒一个标记
  return 60; // 每分钟一个标记
}

/**
 * 生成时间标记数组
 */
export function generateTimeMarkers(duration: number, zoomLevel: number): number[] {
  const markers: number[] = [];
  const interval = calculateTimeMarkerInterval(zoomLevel);

  for (let i = 0; i <= duration; i += interval) {
    markers.push(i);
  }

  return markers;
}

/**
 * 计算可见时间范围
 * 用于虚拟化渲染优化
 */
export function calculateVisibleTimeRange(
  scrollLeft: number,
  containerWidth: number,
  zoomLevel: number,
  bufferRatio: number = 0.5,
): { startTime: number; endTime: number } {
  const buffer = containerWidth * bufferRatio;
  const startTime = pixelsToTime(Math.max(0, scrollLeft - buffer), zoomLevel);
  const endTime = pixelsToTime(scrollLeft + containerWidth + buffer, zoomLevel);

  return { startTime, endTime };
}

/**
 * 检查元素是否在可见范围内
 */
export function isElementVisible(
  elementStartTime: number,
  elementEndTime: number,
  visibleStartTime: number,
  visibleEndTime: number,
): boolean {
  return elementEndTime >= visibleStartTime && elementStartTime <= visibleEndTime;
}

/**
 * 计算选择框与轨道的交集
 */
export function calculateSelectionBoxIntersection(
  selectionBox: {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  },
  trackIndex: number,
  trackHeight: number,
): boolean {
  const boxTop = Math.min(selectionBox.startY, selectionBox.currentY);
  const boxBottom = Math.max(selectionBox.startY, selectionBox.currentY);
  const trackTop = trackIndex * trackHeight;
  const trackBottom = trackTop + trackHeight;

  return boxBottom >= trackTop && boxTop <= trackBottom;
}

/**
 * 计算选择框与元素的交集
 */
export function calculateSelectionBoxElementIntersection(
  selectionBox: {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  },
  elementStartTime: number,
  elementEndTime: number,
  zoomLevel: number,
  trackLabelWidth: number,
): boolean {
  const boxLeft = Math.min(selectionBox.startX, selectionBox.currentX) - trackLabelWidth;
  const boxRight = Math.max(selectionBox.startX, selectionBox.currentX) - trackLabelWidth;
  const elementLeft = timeToPixels(elementStartTime, zoomLevel);
  const elementRight = timeToPixels(elementEndTime, zoomLevel);

  return boxRight >= elementLeft && boxLeft <= elementRight;
}
