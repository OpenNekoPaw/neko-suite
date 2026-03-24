import type { MessageBundle } from '@neko/shared';

export const marketplace = {
  // Search bar
  'marketplace.search.placeholder': 'Search marketplace...',
  'marketplace.search.clear': 'Clear',
  'marketplace.filter.all': 'All',
  'marketplace.filter.skill': 'Skills',
  'marketplace.filter.shader': 'Shaders',
  'marketplace.filter.model': 'Models',
  'marketplace.filter.preset': 'Presets',

  // Tabs
  'marketplace.tab.browse': 'Browse',
  'marketplace.tab.installed': 'Installed',
  'marketplace.tab.updates': 'Updates',

  // Browse view
  'marketplace.browse.featured': 'Featured',
  'marketplace.browse.results': '{count} results',
  'marketplace.browse.searching': 'Searching...',
  'marketplace.browse.noResults': 'No results for "{query}"',
  'marketplace.browse.empty': 'No packages available yet.',

  // Installed view
  'marketplace.installed.empty': 'No marketplace packages installed yet.',

  // Updates view
  'marketplace.updates.empty': 'All packages are up to date.',
  'marketplace.updates.updateAll': 'Update All',
  'marketplace.updates.count': '{count} update available',
  'marketplace.updates.countPlural': '{count} updates available',

  // Actions
  'marketplace.action.install': 'Install',
  'marketplace.action.uninstall': 'Uninstall',
  'marketplace.action.update': 'Update',
  'marketplace.action.installing': 'Installing...',
  'marketplace.action.uninstalling': 'Uninstalling...',

  // Progress
  'marketplace.progress.downloading': 'Downloading',
  'marketplace.progress.extracting': 'Extracting',
  'marketplace.progress.installing': 'Installing',

  // Errors
  'marketplace.error.installFailed': 'Install failed: {message}',
  'marketplace.error.uninstallFailed': 'Uninstall failed: {message}',
  'marketplace.error.searchFailed': 'Search failed. Please try again.',
  'marketplace.error.loadFailed': 'Failed to load marketplace data.',
} as const satisfies MessageBundle;
