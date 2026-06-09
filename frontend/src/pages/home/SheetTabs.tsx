/**
 * SheetTabs - the bottom-sheet tab bar, extracted from Home as the first step of
 * the targeted decomposition. Fully self-contained and presentational: it takes
 * the active tab and a setter and owns the WAI-ARIA tablist behaviour (roving
 * tabindex + arrow-key navigation). Behaviour is identical to the inline version.
 */
import { Activity, Crosshair, Route, Settings as SettingsIcon } from 'lucide-react';

export type SheetTab = 'track' | 'devices' | 'routes' | 'settings';

export const SHEET_TAB_ORDER: SheetTab[] = ['track', 'devices', 'routes', 'settings'];

const TABS: Array<{ id: SheetTab; label: string; Icon: typeof Activity }> = [
  { id: 'track', label: 'Map', Icon: Crosshair },
  { id: 'devices', label: 'Status', Icon: Activity },
  { id: 'routes', label: 'Directions', Icon: Route },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

interface SheetTabsProps {
  tab: SheetTab;
  setTab: (t: SheetTab) => void;
}

export default function SheetTabs({ tab, setTab }: SheetTabsProps) {
  return (
    <div
      className="tabs"
      role="tablist"
      aria-label="Views"
      onKeyDown={e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const i = SHEET_TAB_ORDER.indexOf(tab);
        const delta = e.key === 'ArrowRight' ? 1 : SHEET_TAB_ORDER.length - 1;
        const next = SHEET_TAB_ORDER[(i + delta) % SHEET_TAB_ORDER.length];
        setTab(next);
        const btns = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        btns[SHEET_TAB_ORDER.indexOf(next)]?.focus();
      }}
    >
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          tabIndex={tab === id ? 0 : -1}
          className={tab === id ? 'active' : ''}
          onClick={() => setTab(id)}
        >
          <span className="tab-icon">
            <Icon aria-hidden="true" />
          </span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
