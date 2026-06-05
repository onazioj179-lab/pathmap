import { Route, Compass, ShieldCheck, Navigation, BarChart3 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import './BottomNav.css';

type PanelId = 'routing' | 'compare' | 'safe' | 'track' | 'marks';

interface BottomNavProps {
  activePanel: string | null;
  onTabClick: (panel: PanelId) => void;
}

const tabs: { id: PanelId; icon: LucideIcon; label: string }[] = [
  { id: 'routing', icon: Route, label: 'Route' },
  { id: 'compare', icon: Compass, label: 'Explore' },
  { id: 'safe', icon: ShieldCheck, label: 'Safe' },
  { id: 'track', icon: Navigation, label: 'Track' },
  { id: 'marks', icon: BarChart3, label: 'Stats' },
];

export default function BottomNav({ activePanel, onTabClick }: BottomNavProps) {
  return (
    <nav className="pm-bottomnav" aria-label="Primary">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const active = activePanel === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabClick(tab.id)}
            className="pm-bottomnav__btn"
            aria-pressed={active}
            aria-label={tab.label}
          >
            <Icon className="pm-bottomnav__icon" aria-hidden="true" strokeWidth={2} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
