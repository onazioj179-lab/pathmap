/**
 * CommandPalette - Cmd/Ctrl-K command surface.
 *
 * Opens over the app, fuzzy-filters the command registry, and dispatches the
 * chosen command into mapCommandBus / trackingService / prefs. Fully keyboard
 * operable (arrows + Enter + Esc) with combobox/listbox ARIA. Recently-used
 * commands are remembered (encrypted, on-device) and float to the top.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEngineState } from '../../hooks/useEngineState';
import { controlState, CONTROL_STATE_EVENT } from '../../services/controlState';
import {
  commandRegistry,
  COMMANDS_CHANGED_EVENT,
  Command,
} from '../../services/commandRegistry';
import { eventBus } from '../../services/eventBus';
import { lepl } from '../../services/localEncryptedProfile';
import './CommandPalette.css';

const RECENTS_KEY = 'command_recents';
const MAX_RECENTS = 8;

/** Subsequence fuzzy match; returns a score (lower = tighter) or null. */
function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  let qi = 0;
  let score = 0;
  let last = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (last >= 0) score += ti - last;
      last = ti;
      qi++;
    }
  }
  return qi === q.length ? score : null;
}

export default function CommandPalette() {
  const { paletteOpen } = useEngineState(CONTROL_STATE_EVENT, controlState.getSnapshot);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [commands, setCommands] = useState<Command[]>(() => commandRegistry.list());
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the command list in sync (stable React state, not a live getSnapshot).
  useEffect(() => {
    const off = eventBus.on<Command[]>(COMMANDS_CHANGED_EVENT, list => setCommands(list));
    return off;
  }, []);

  // Load recent command ids (encrypted, on-device).
  useEffect(() => {
    let alive = true;
    void lepl
      .load(RECENTS_KEY)
      .then((data: { recent?: string[] } | null) => {
        if (alive && data && Array.isArray(data.recent)) {
          setRecents(data.recent);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Global Cmd/Ctrl-K toggles the palette; Esc closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        controlState.togglePalette();
      } else if (e.key === 'Escape' && controlState.getSnapshot().paletteOpen) {
        controlState.togglePalette(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Focus the input on open; restore focus to the prior element on close.
  const prevFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (paletteOpen) {
      prevFocusRef.current = (document.activeElement as HTMLElement) ?? null;
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
      return () => {
        prevFocusRef.current?.focus?.();
      };
    }
  }, [paletteOpen]);

  const filtered = useMemo(() => {
    const scored: Array<{ cmd: Command; score: number }> = [];
    for (const cmd of commands) {
      const hay = `${cmd.label} ${cmd.group ?? ''} ${(cmd.keywords ?? []).join(' ')}`;
      const score = fuzzyScore(query, hay);
      if (score !== null) {
        // Recently-used commands get a strong boost (lower score sorts first).
        const recentBoost = recents.includes(cmd.id) ? -1000 + recents.indexOf(cmd.id) : 0;
        scored.push({ cmd, score: score + recentBoost });
      }
    }
    scored.sort((a, b) => a.score - b.score);
    return scored.map(s => s.cmd);
  }, [commands, query, recents]);

  const runCommand = useCallback(
    (cmd: Command) => {
      controlState.togglePalette(false);
      const next = [cmd.id, ...recents.filter(id => id !== cmd.id)].slice(0, MAX_RECENTS);
      setRecents(next);
      void lepl.save(RECENTS_KEY, { recent: next }).catch(() => {});
      try {
        cmd.run();
      } catch (err) {
        console.error('[CommandPalette] command failed:', err);
      }
    },
    [recents]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[active];
      if (cmd) runCommand(cmd);
    }
  };

  // Keep the active option scrolled into view.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView?.({ block: 'nearest' });
  }, [active, filtered.length]);

  if (!paletteOpen) return null;

  return (
    <div
      className="cmdk-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={e => {
        if (e.target === e.currentTarget) controlState.togglePalette(false);
      }}
    >
      <div className="cmdk-panel">
        <input
          ref={inputRef}
          className="cmdk-input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="cmdk-listbox"
          aria-activedescendant={filtered[active] ? `cmdk-opt-${filtered[active].id}` : undefined}
          aria-autocomplete="list"
          placeholder="Type a command... (zoom, satellite, follow, track)"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul className="cmdk-list" id="cmdk-listbox" role="listbox" ref={listRef}>
          {filtered.length === 0 && <li className="cmdk-empty">No matching commands</li>}
          {filtered.map((cmd, i) => (
            <li
              key={cmd.id}
              id={`cmdk-opt-${cmd.id}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              className={`cmdk-item${i === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={e => {
                e.preventDefault();
                runCommand(cmd);
              }}
            >
              <span className="cmdk-item-label">{cmd.label}</span>
              {cmd.group && <span className="cmdk-item-group">{cmd.group}</span>}
            </li>
          ))}
        </ul>
        <div className="cmdk-hint" aria-hidden="true">
          <kbd>↑</kbd>
          <kbd>↓</kbd> navigate <kbd>↵</kbd> run <kbd>esc</kbd> close
        </div>
      </div>
    </div>
  );
}
