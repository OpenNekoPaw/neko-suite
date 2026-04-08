#!/usr/bin/env node
/**
 * FFmpeg Environment Setup Script
 *
 * Detects FFmpeg installation and sets environment variables for ffmpeg-next crate.
 * Supports:
 * - macOS: Homebrew (Intel + Apple Silicon)
 * - Linux: apt/yum installed FFmpeg
 * - Windows: vcpkg or manual installation
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ANSI colors for output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function findFFmpegPath() {
  const platform = os.platform();

  if (platform === 'darwin') {
    // macOS: Check Homebrew paths
    const homebrewPaths = [
      '/opt/homebrew/opt/ffmpeg',      // Apple Silicon
      '/usr/local/opt/ffmpeg',          // Intel
      '/opt/homebrew/Cellar/ffmpeg',    // Cellar path (Apple Silicon)
      '/usr/local/Cellar/ffmpeg',       // Cellar path (Intel)
    ];

    for (const basePath of homebrewPaths) {
      if (fs.existsSync(basePath)) {
        // If it's a Cellar path, find the latest version
        if (basePath.includes('Cellar')) {
          try {
            const versions = fs.readdirSync(basePath);
            if (versions.length > 0) {
              const latestVersion = versions.sort().pop();
              const fullPath = path.join(basePath, latestVersion);
              if (fs.existsSync(path.join(fullPath, 'include', 'libavcodec'))) {
                return fullPath;
              }
            }
          } catch (e) {
            continue;
          }
        } else {
          // Check if include directory exists
          if (fs.existsSync(path.join(basePath, 'include', 'libavcodec'))) {
            return basePath;
          }
        }
      }
    }

    // Try pkg-config
    try {
      const pkgConfigPath = execSync('pkg-config --variable=prefix libavcodec 2>/dev/null', { encoding: 'utf8' }).trim();
      if (pkgConfigPath && fs.existsSync(pkgConfigPath)) {
        return pkgConfigPath;
      }
    } catch (e) {
      // pkg-config not available or FFmpeg not found
    }

  } else if (platform === 'linux') {
    // Linux: Check common paths
    const linuxPaths = [
      '/usr',
      '/usr/local',
    ];

    for (const basePath of linuxPaths) {
      const includePath = path.join(basePath, 'include', 'libavcodec');
      const altIncludePath = path.join(basePath, 'include', 'ffmpeg', 'libavcodec');

      if (fs.existsSync(includePath) || fs.existsSync(altIncludePath)) {
        return basePath;
      }
    }

    // Try pkg-config
    try {
      const pkgConfigPath = execSync('pkg-config --variable=prefix libavcodec 2>/dev/null', { encoding: 'utf8' }).trim();
      if (pkgConfigPath && fs.existsSync(pkgConfigPath)) {
        return pkgConfigPath;
      }
    } catch (e) {
      // pkg-config not available
    }

  } else if (platform === 'win32') {
    // Windows: Check common paths
    const windowsPaths = [
      process.env.FFMPEG_DIR,
      'C:\\ffmpeg',
      'C:\\Program Files\\ffmpeg',
      path.join(process.env.USERPROFILE || '', 'ffmpeg'),
    ].filter(Boolean);

    for (const basePath of windowsPaths) {
      if (fs.existsSync(basePath) && fs.existsSync(path.join(basePath, 'include'))) {
        return basePath;
      }
    }
  }

  return null;
}

function getPkgConfigPath(ffmpegPath) {
  const platform = os.platform();

  if (platform === 'darwin') {
    // macOS Homebrew
    const pkgConfigDir = path.join(ffmpegPath, 'lib', 'pkgconfig');
    if (fs.existsSync(pkgConfigDir)) {
      return pkgConfigDir;
    }
  } else if (platform === 'linux') {
    // Linux: Check multiple locations
    const possiblePaths = [
      path.join(ffmpegPath, 'lib', 'pkgconfig'),
      path.join(ffmpegPath, 'lib64', 'pkgconfig'),
      path.join(ffmpegPath, 'lib', 'x86_64-linux-gnu', 'pkgconfig'),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }

  return null;
}

function main() {
  log('\n🎬 FFmpeg Environment Setup', 'green');
  log('================================\n');

  // Check if already set
  if (process.env.FFMPEG_DIR) {
    log(`FFMPEG_DIR already set: ${process.env.FFMPEG_DIR}`, 'yellow');
  }

  // Find FFmpeg
  const ffmpegPath = findFFmpegPath();

  if (!ffmpegPath) {
    log('❌ FFmpeg not found!', 'red');
    log('\nPlease install FFmpeg development libraries:', 'yellow');

    const platform = os.platform();
    if (platform === 'darwin') {
      log('\n  brew install ffmpeg pkg-config\n');
    } else if (platform === 'linux') {
      log('\n  # Debian/Ubuntu:');
      log('  sudo apt-get install -y libavcodec-dev libavformat-dev libavutil-dev libswscale-dev libswresample-dev pkg-config');
      log('\n  # Fedora/RHEL:');
      log('  sudo dnf install ffmpeg-devel pkg-config\n');
    } else if (platform === 'win32') {
      log('\n  Download FFmpeg from https://ffmpeg.org/download.html');
      log('  Set FFMPEG_DIR environment variable to the installation path\n');
    }

    process.exit(1);
  }

  log(`✅ FFmpeg found: ${ffmpegPath}`, 'green');

  // Get pkg-config path
  const pkgConfigPath = getPkgConfigPath(ffmpegPath);

  // Set environment variables for child processes
  process.env.FFMPEG_DIR = ffmpegPath;
  log(`   FFMPEG_DIR=${ffmpegPath}`);

  if (pkgConfigPath) {
    // Append to existing PKG_CONFIG_PATH
    const existingPath = process.env.PKG_CONFIG_PATH || '';
    process.env.PKG_CONFIG_PATH = existingPath
      ? `${pkgConfigPath}:${existingPath}`
      : pkgConfigPath;
    log(`   PKG_CONFIG_PATH=${process.env.PKG_CONFIG_PATH}`);
  }

  log('\n✅ FFmpeg environment configured successfully!\n', 'green');
}

// Run setup
main();

// Export environment for use by npm scripts
module.exports = {
  FFMPEG_DIR: process.env.FFMPEG_DIR,
  PKG_CONFIG_PATH: process.env.PKG_CONFIG_PATH,
};
