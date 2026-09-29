import { useProject } from '../store/projectStore';

// Is the user's game a side-scroller? Then figures are drawn and animated mainly from the side.
// The map's view decides; the figure builder can override it ("Mein Spiel"), remembered per browser.

const KEY = 'mapforge.gameView';
export type GameView = 'side' | 'top';

function stored(): GameView | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'side' || v === 'top' ? v : null;
  } catch {
    return null;
  }
}

export function gameView(): GameView {
  return stored() ?? (useProject.getState().project.map.perspective === 'side_view' ? 'side' : 'top');
}

export const sideGame = () => gameView() === 'side';

export function setGameView(v: GameView) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* private mode: the map's view decides */
  }
}

/** words that mean a side-scroller */
export const SIDE_WORDS = /side.?scroll|plattform|platformer|jump.?(and|&|n|'n).?run|seitenansicht|metroidvania/i;
