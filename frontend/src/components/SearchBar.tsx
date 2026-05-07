/**
 * =====================================================================
 * PATHFINDER — SEARCH BAR COMPONENT
 * Simple search input for location queries
 * =====================================================================
 * Author: Onazi Treasure
 * Watermark: OJ
 */

import '../styles/SearchBar.css';

interface SearchBarV97Props {
  className?: string;
}

export default function SearchBarV97({ className = '' }: SearchBarV97Props) {
  return (
    <div className={`search-bar-v97 ${className}`}>
      <input
        id="searchInput"
        type="text"
        placeholder="Search for a location..."
        className="search-bar-v97-input"
      />
      <div className="search-bar-v97-hint">
        Press Enter
      </div>
    </div>
  );
}
