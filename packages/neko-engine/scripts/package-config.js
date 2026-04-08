#!/usr/bin/env node
'use strict';

const path = require('path');
const rawConfig = require('./package-config.json');

const ENGINE_DIR = path.resolve(__dirname, '..');
const NAPI_DIR = path.join(ENGINE_DIR, 'packages', 'host-napi');
const BIN_DIR = path.join(ENGINE_DIR, 'bin');
const BTBN_BASE_URL = 'https://github.com/BtbN/FFmpeg-Builds/releases/download';

/**
 * @param {string} template
 * @returns {string}
 */
function expandTemplate(template) {
  return template
    .replaceAll('{ortVersion}', rawConfig.ortVersion)
    .replaceAll('{btbnVersion}', rawConfig.btbnVersion)
    .replaceAll('{btbnTag}', rawConfig.btbnTag);
}

/**
 * @returns {string[]}
 */
function getSupportedTargets() {
  return Object.keys(rawConfig.targets);
}

/**
 * @param {string} targetKey
 * @returns {null | {
 *   nodeFile: string;
 *   ort: { archive: string; innerPath: string; dest: string; ext: 'tgz' | 'zip' };
 *   ffmpeg: { source: 'homebrew'; brewPrefix: string } | { source: 'btbn'; archive: string };
 * }}
 */
function getTargetConfig(targetKey) {
  const target = rawConfig.targets[targetKey];
  if (!target) {
    return null;
  }

  const ffmpeg =
    target.ffmpeg.source === 'homebrew'
      ? {
          source: 'homebrew',
          brewPrefix: target.ffmpeg.brewPrefix,
        }
      : {
          source: 'btbn',
          archive: expandTemplate(target.ffmpeg.archiveTemplate),
        };

  return {
    nodeFile: target.nodeFile,
    ort: {
      archive: expandTemplate(target.ort.archiveTemplate),
      innerPath: expandTemplate(target.ort.innerPathTemplate),
      dest: expandTemplate(target.ort.destTemplate),
      ext: target.ort.ext,
    },
    ffmpeg,
  };
}

/**
 * @returns {string}
 */
function getCurrentPlatformKey() {
  return `${process.platform}-${process.arch}`;
}

/**
 * @returns {string[]}
 */
function getFfmpegLibs() {
  return [...rawConfig.ffmpegLibs];
}

/**
 * @returns {string}
 */
function getOrtBaseUrl() {
  return `https://github.com/microsoft/onnxruntime/releases/download/v${rawConfig.ortVersion}`;
}

/**
 * @param {string} targetKey
 * @returns {string}
 */
function resolveNodeBinaryPath(targetKey) {
  const target = getTargetConfig(targetKey);
  if (!target) {
    throw new Error(`Unsupported target "${targetKey}"`);
  }

  return path.join(NAPI_DIR, target.nodeFile);
}

module.exports = {
  BIN_DIR,
  BTBN_BASE_URL,
  ENGINE_DIR,
  NAPI_DIR,
  config: rawConfig,
  getCurrentPlatformKey,
  getFfmpegLibs,
  getOrtBaseUrl,
  getSupportedTargets,
  getTargetConfig,
  resolveNodeBinaryPath,
};
