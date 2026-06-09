/**
 * PATHMAP - Command Registry
 * ==========================
 * Backs the Cmd/Ctrl-K command palette. Map/control commands register at import;
 * view-specific commands (tracking, settings) are registered by the owning
 * component via register()/registerMany() and unregistered on unmount.
 *
 * `commands:changed` is emitted on the eventBus so the palette re-renders when
 * the available command set changes.
 */

import { eventBus } from './eventBus';
import { mapCommandBus } from './mapCommandBus';
import { controlState } from './controlState';

export interface Command {
  id: string;
  label: string;
  group?: string;
  keywords?: string[];
  run: () => void;
}

export const COMMANDS_CHANGED_EVENT = 'commands:changed';

class CommandRegistry {
  private commands = new Map<string, Command>();

  register(cmd: Command): () => void {
    this.commands.set(cmd.id, cmd);
    eventBus.emit(COMMANDS_CHANGED_EVENT, this.list());
    return () => this.unregister(cmd.id);
  }

  registerMany(cmds: Command[]): () => void {
    cmds.forEach(c => this.commands.set(c.id, c));
    eventBus.emit(COMMANDS_CHANGED_EVENT, this.list());
    return () => {
      cmds.forEach(c => this.commands.delete(c.id));
      eventBus.emit(COMMANDS_CHANGED_EVENT, this.list());
    };
  }

  unregister(id: string): void {
    if (this.commands.delete(id)) {
      eventBus.emit(COMMANDS_CHANGED_EVENT, this.list());
    }
  }

  list(): Command[] {
    return [...this.commands.values()];
  }
}

export const commandRegistry = new CommandRegistry();

// Default map + control commands. These depend only on the map command bus and
// control state, so they are safe to register at module load.
commandRegistry.registerMany([
  { id: 'map.zoomIn', label: 'Zoom in', group: 'Map', keywords: ['closer', 'in'], run: () => mapCommandBus.zoomBy(1) },
  { id: 'map.zoomOut', label: 'Zoom out', group: 'Map', keywords: ['further', 'out'], run: () => mapCommandBus.zoomBy(-1) },
  { id: 'map.recenter', label: 'Recenter on my location', group: 'Map', keywords: ['center', 'gps', 'home'], run: () => mapCommandBus.recenter() },
  { id: 'map.resetNorth', label: 'Reset bearing to north', group: 'Map', keywords: ['north', 'compass', 'rotate'], run: () => mapCommandBus.resetNorth() },
  { id: 'map.followMe', label: 'Toggle follow-me', group: 'Map', keywords: ['follow', 'track me'], run: () => mapCommandBus.toggleFollowMe() },
  { id: 'map.mode.2d', label: 'View: 2D (flat)', group: 'Map mode', keywords: ['flat', 'top down'], run: () => void mapCommandBus.setMode('2d') },
  { id: 'map.mode.3d', label: 'View: 3D (tilted)', group: 'Map mode', keywords: ['tilt', 'perspective'], run: () => void mapCommandBus.setMode('3d') },
  { id: 'map.mode.standard', label: 'View: Standard map', group: 'Map mode', keywords: ['street', 'default'], run: () => void mapCommandBus.setMode('standard') },
  { id: 'map.mode.satellite', label: 'View: Satellite', group: 'Map mode', keywords: ['imagery', 'aerial'], run: () => void mapCommandBus.setMode('satellite') },
  { id: 'map.mode.globe', label: 'View: Globe', group: 'Map mode', keywords: ['earth', 'sphere'], run: () => void mapCommandBus.setMode('globe') },
  { id: 'hud.toggle', label: 'Toggle telemetry HUD', group: 'View', keywords: ['flow', 'fps', 'diagnostics', 'stats'], run: () => controlState.toggleHud() },
]);

export default commandRegistry;
