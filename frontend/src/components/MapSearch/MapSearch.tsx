/**
 * MapSearch - the floating, Apple Maps-style place search.
 *
 * Frosted rounded search field that geocodes via Nominatim (OSM) with a debounced
 * autocomplete dropdown. Selecting a result flies the map there (mapCommandBus)
 * and hands the destination back to Home, which drops a target and routes to it -
 * so the live path appears on the map. Fully keyboard operable.
 */
import { useEffect, useRef, useState } from 'react';
import { mapCommandBus } from '../../services/mapCommandBus';
import './MapSearch.css';

export interface SearchDestination {
  lat: number;
  lng: number;
  name: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  type?: string;
}

interface MapSearchProps {
  onSelectDestination: (dest: SearchDestination) => void;
}

function splitName(r: NominatimResult): { primary: string; secondary: string } {
  const parts = r.display_name.split(',').map(p => p.trim());
  const primary = r.name && r.name.length ? r.name : parts[0];
  const secondary = parts.slice(primary === parts[0] ? 1 : 0).join(', ');
  return { primary, secondary };
}

export default function MapSearch({ onSelectDestination }: MapSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Debounced geocode.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' }, signal: ctrl.signal });
        const data: NominatimResult[] = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setActive(0);
        setOpen(true);
      } catch {
        /* aborted or network error */
      } finally {
        setLoading(false);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [query]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const choose = (r: NominatimResult) => {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    const { primary } = splitName(r);
    setQuery(primary);
    setOpen(false);
    mapCommandBus.flyTo(lat, lng, { zoom: 15 });
    onSelectDestination({ lat, lng, name: primary });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) choose(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="mapsearch" ref={rootRef}>
      <div className="mapsearch-field" role="search">
        <svg className="mapsearch-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          className="mapsearch-input"
          placeholder="Search Maps"
          aria-label="Search for a place"
          role="combobox"
          aria-expanded={open}
          aria-controls="mapsearch-results"
          autoComplete="off"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button
            type="button"
            className="mapsearch-clear"
            aria-label="Clear search"
            onMouseDown={e => {
              e.preventDefault();
              setQuery('');
              setResults([]);
              setOpen(false);
            }}
          >
            &times;
          </button>
        )}
      </div>

      {open && (query.trim().length >= 3) && (
        <ul className="mapsearch-results" id="mapsearch-results" role="listbox">
          {loading && results.length === 0 && <li className="mapsearch-empty">Searching…</li>}
          {!loading && results.length === 0 && <li className="mapsearch-empty">No places found</li>}
          {results.map((r, i) => {
            const { primary, secondary } = splitName(r);
            return (
              <li
                key={`${r.lat},${r.lon},${i}`}
                role="option"
                aria-selected={i === active}
                className={`mapsearch-result${i === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={e => {
                  e.preventDefault();
                  choose(r);
                }}
              >
                <span className="mapsearch-pin" aria-hidden="true" />
                <span className="mapsearch-text">
                  <span className="mapsearch-primary">{primary}</span>
                  {secondary && <span className="mapsearch-secondary">{secondary}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
