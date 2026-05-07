/**
 * SIMPLE LOCATION BAR
 * Shows detected location - no toggles, no controls
 */

import React from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/solid';
import type { LocationData } from '../services/autoLocation';

interface SimpleLocationBarProps {
  location: LocationData | null;
}

export const SimpleLocationBar: React.FC<SimpleLocationBarProps> = ({ location }) => {
  if (!location) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-50 pointer-events-none font-mono">
      <div className="border-2 border-emerald-500 bg-black px-4 py-2 text-emerald-400 text-sm flex items-center gap-3 max-w-fit mx-auto">
        <ChevronRightIcon className="w-4 h-4 text-emerald-500" />
        <span className="tracking-wide">
          {location.city.toUpperCase()}, {location.country.toUpperCase()}
        </span>
      </div>
    </div>
  );
};

export default SimpleLocationBar;
