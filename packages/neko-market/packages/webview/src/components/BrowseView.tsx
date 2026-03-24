/**
 * BrowseView — Featured packages and search results grid.
 */

import React from 'react';
import { useMarketplaceStore } from '../stores/marketplaceStore';
import { AssetCard } from './AssetCard';

export const BrowseView: React.FC = () => {
  const { searchText, featured, searchResults, searchTotal, isSearching } = useMarketplaceStore();

  const showFeatured = !searchText;
  const showResults = !!searchText;

  return (
    <div className="browse-view">
      {/* Loading spinner */}
      {isSearching && (
        <div className="loading-state">
          <span className="codicon codicon-loading codicon-modifier-spin" />
        </div>
      )}

      {/* Featured section (no active search) */}
      {showFeatured && !isSearching && (
        <section className="featured-section">
          {featured.length > 0 ? (
            <>
              <h3 className="section-title">Featured</h3>
              <div className="asset-grid">
                {featured.map((item) => (
                  <AssetCard key={item.id} item={item} />
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <span className="codicon codicon-package empty-state__icon" />
              <p className="empty-state__text">No packages available yet.</p>
            </div>
          )}
        </section>
      )}

      {/* Search results */}
      {showResults && !isSearching && (
        <section className="results-section">
          <div className="results-header">
            <span className="results-count">
              {searchTotal} result{searchTotal !== 1 ? 's' : ''} for &ldquo;{searchText}&rdquo;
            </span>
          </div>

          {searchResults.length > 0 ? (
            <div className="asset-grid">
              {searchResults.map((item) => (
                <AssetCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span className="codicon codicon-search empty-state__icon" />
              <p className="empty-state__text">No results for &ldquo;{searchText}&rdquo;</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
