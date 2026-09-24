import { isBackView, type Body, type Bounds, type Creature, type CustomAnim, type SpriteDoc, type SpriteKind, type SpriteLayer, type View } from './types';
import { compose, fitContext, viewLayers } from './store';
import { shiftColor } from './palette';
import { S } from './painter';
import { frontish, weaponHand, weaponRest } from './parts/character';

// Animations are built from the layers of a character / object: every pixel belongs to a
// body region (head, torso, left/right arm incl. held items, left/right leg) and each frame
// moves the regions a little (breathing, walking, jumping …). Works for drawn layers too,
// because regions come from the body measurements, not from the parts.

export type Region = 'head' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR' | 'ground' | 'effect' | 'weapon';
type Off = { x: number; y: number };

export interface Pose {
  /** offset per region (the weapon also follows armR) */
  off?: Partial<Record<Region, Off>>;
  /**
   * rotation per region in degrees, clockwise: arms turn around the shoulder, legs around the hip,
   * the head around the neck, the weapon around the grip (and then with the arm).
   */
  rot?: Partial<Record<Region, number>>;
  /** rotate the whole figure around the feet (degrees, clockwise) – falling over, wobbling */
  spin?: number;
  /** added to every region except the ground shadow */
  all?: Off;
  /** lean: horizontal shift per pixel above the feet */
  lean?: number;
  /** tint all pixels (hit flash) */
  flash?: 'white' | 'red';
  /** brighten / darken (−1..1) */
  bright?: number;
  /** rotate the whole figure 90° (lying) */
  lie?: boolean;
  alpha?: number;
  /** effect layers hidden in this frame (flicker) */
  hideEffects?: boolean;
  /** dust puffs behind the feet */
  dust?: number;
  /** squash (< 1) / stretch (> 1) towards the feet */
  squash?: number;
  /** the hand keeps the weapon steady: this share (0..1) of the arm turn is undone at the grip */
  hold?: number;
  /** motion trail behind the weapon tip: degrees of the swing (+ clockwise, − counter-clockwise) */
  trail?: number;
}

export interface AnimDef {
  id: string;
  label: string;
  kind: SpriteKind;
  fps: number;
  loop: boolean;
  poses: Pose[];
  /** own poses for the side / back view (else the front poses) */
  side?: Pose[];
  back?: Pose[];
  hint: string;
}

const o = (x: number, y: number): Off => ({ x, y });

export const ANIMATIONS: AnimDef[] = [
  // ---------------------------------------------------------------- characters
  // Angles: clockwise in degrees. Front view: the weapon arm is on the right, −90 lifts it
  // sideways, −160 over the head. Side view (facing right): −90 = arm forward, +90 = back.
  // "weapon" turns the weapon in the hand on top of the arm (keeps a sword upright while the arm moves).
  {
    id: 'idle',
    label: 'Atmen',
    kind: 'character',
    fps: 4,
    loop: true,
    hint: 'Ruhepose, Oberkörper hebt und senkt sich',
    poses: [{}, { off: { head: o(0, 1), torso: o(0, 0), armL: o(0, 1), armR: o(0, 1) } }, { off: { head: o(0, 1), torso: o(0, 1), armL: o(0, 1), armR: o(0, 1) } }, { off: { head: o(0, 1), armL: o(0, 1), armR: o(0, 1) } }],
  },
  {
    id: 'walk',
    label: 'Laufen',
    kind: 'character',
    fps: 8,
    loop: true,
    hint: 'Beine abwechselnd, Arme schwingen gegengleich – von der Seite mit 8 Bildern und echtem Schritt',
    poses: [
      { off: { legL: o(0, -1), armL: o(0, 1), armR: o(0, -1) } },
      { off: { head: o(0, 1), torso: o(0, 1), armL: o(0, 1), armR: o(0, 1) } },
      { off: { legR: o(0, -1), armL: o(0, -1), armR: o(0, 1) } },
      { off: { head: o(0, 1), torso: o(0, 1), armL: o(0, 1), armR: o(0, 1) } },
    ],
    side: [
      // contact – down – passing – up, then the other leg
      { hold: 0.65, rot: { legR: -26, legL: 24, armR: 22 }, all: o(0, 1) },
      { hold: 0.65, rot: { legR: -14, legL: 16, armR: 12 }, all: o(0, 1), off: { head: o(0, 1) } },
      { hold: 0.65, rot: { legR: 2, legL: -4, armR: 0 }, off: { legL: o(0, -1) } },
      { hold: 0.65, rot: { legR: 14, legL: -14, armR: -12 }, all: o(0, -1) },
      { hold: 0.65, rot: { legR: 24, legL: -26, armR: -22 }, all: o(0, 1) },
      { hold: 0.65, rot: { legR: 16, legL: -14, armR: -12 }, all: o(0, 1), off: { head: o(0, 1) } },
      { hold: 0.65, rot: { legR: -4, legL: 2, armR: 0 }, off: { legR: o(0, -1) } },
      { hold: 0.65, rot: { legR: -14, legL: 14, armR: 12 }, all: o(0, -1) },
    ],
  },
  {
    id: 'run',
    label: 'Rennen',
    kind: 'character',
    fps: 12,
    loop: true,
    hint: 'Schneller, höhere Knie, stärkerer Armschwung, Staub – von der Seite nach vorn gelehnt',
    poses: [
      { all: o(0, -1), off: { legL: o(0, -2), armL: o(0, 2), armR: o(0, -2) } },
      { off: { head: o(0, 1), torso: o(0, 1), armL: o(0, 1), armR: o(0, 1) } },
      { all: o(0, -1), off: { legR: o(0, -2), armL: o(0, -2), armR: o(0, 2) } },
      { off: { head: o(0, 1), torso: o(0, 1), armL: o(0, 1), armR: o(0, 1) } },
    ],
    side: [
      { lean: 0.08, hold: 0.65, rot: { legR: -40, legL: 34, armR: 40 }, all: o(0, 1), dust: 1 },
      { lean: 0.08, hold: 0.65, rot: { legR: -18, legL: 50, armR: 20 }, all: o(0, -1) },
      { lean: 0.08, hold: 0.65, rot: { legR: 12, legL: -8, armR: -10 }, all: o(0, -2), off: { legL: o(0, -2) } },
      { lean: 0.08, hold: 0.65, rot: { legR: 34, legL: -40, armR: -40 }, all: o(0, 1), dust: 1 },
      { lean: 0.08, hold: 0.65, rot: { legR: 50, legL: -18, armR: -20 }, all: o(0, -1) },
      { lean: 0.08, hold: 0.65, rot: { legR: -8, legL: 12, armR: 10 }, all: o(0, -2), off: { legR: o(0, -2) } },
    ],
  },
  {
    id: 'jump',
    label: 'Springen',
    kind: 'character',
    fps: 12,
    loop: false,
    hint: 'Ausholen (gestaucht), Absprung (gestreckt), Flug, Landung – der Schatten bleibt am Boden',
    poses: [
      { squash: 0.84, rot: { armL: -15, armR: 15 } },
      { all: o(0, -3), squash: 1.12, rot: { armL: 60, armR: -60, weapon: 45 } },
      { all: o(0, -7), rot: { armL: 110, armR: -110, weapon: 90 }, off: { legL: o(0, -1), legR: o(0, -1) } },
      { all: o(0, -8), rot: { armL: 120, armR: -120, weapon: 100 }, off: { legL: o(0, -1), legR: o(0, -1) } },
      { all: o(0, -4), squash: 1.06, rot: { armL: 60, armR: -60, weapon: 45 } },
      { squash: 0.82, rot: { armL: 30, armR: -30, weapon: 20 } },
      { squash: 0.94 },
    ],
    side: [
      { squash: 0.84, lean: 0.05, rot: { armR: 30, legR: -10, legL: 10 } },
      { all: o(0, -3), squash: 1.12, rot: { armR: -120, weapon: 100, legL: 25 } },
      { all: o(0, -7), rot: { armR: -150, weapon: 130, legR: -45, legL: 30 }, off: { legR: o(0, -1) } },
      { all: o(0, -8), rot: { armR: -140, weapon: 120, legR: -45, legL: 30 }, off: { legR: o(0, -1) } },
      { all: o(0, -4), squash: 1.06, rot: { armR: -80, weapon: 60, legR: -20, legL: 10 } },
      { squash: 0.82, rot: { armR: -30, weapon: 20, legR: -12, legL: 12 } },
      { squash: 0.94 },
    ],
  },
  {
    id: 'slide',
    label: 'Rutschen',
    kind: 'character',
    fps: 10,
    loop: true,
    hint: 'Nach vorn gelehnt, Staub hinter den Füßen',
    poses: [
      { lean: 0.12, off: { head: o(0, 1), torso: o(0, 1) }, dust: 1 },
      { lean: 0.2, off: { head: o(0, 2), torso: o(0, 1), armL: o(0, 1), armR: o(0, 1) }, dust: 2 },
      { lean: 0.2, off: { head: o(0, 2), torso: o(0, 1), armL: o(0, 1), armR: o(0, 1) }, dust: 3 },
      { lean: 0.16, off: { head: o(0, 1), torso: o(0, 1) }, dust: 2 },
    ],
    side: [
      { lean: -0.1, rot: { legR: -40, legL: -20, armR: 50, weapon: -40 }, all: o(0, 2), dust: 1 },
      { lean: -0.12, rot: { legR: -45, legL: -25, armR: 60, weapon: -50 }, all: o(0, 2), dust: 2 },
      { lean: -0.12, rot: { legR: -45, legL: -25, armR: 60, weapon: -50 }, all: o(0, 2), dust: 3 },
      { lean: -0.1, rot: { legR: -40, legL: -20, armR: 50, weapon: -40 }, all: o(0, 2), dust: 2 },
    ],
  },
  {
    id: 'attack',
    label: 'Angriff',
    kind: 'character',
    fps: 14,
    loop: false,
    hint: 'Ausholen über den Kopf, Schlag mit Wischspur, Nachschwung – 6 Bilder',
    poses: [
      { rot: { armR: -30, weapon: 70 }, all: o(0, 1), off: { head: o(0, 1) } },
      { rot: { armR: -140, weapon: 110 } },
      { rot: { armR: 20, weapon: 180 }, trail: 150, off: { torso: o(0, 1), head: o(0, 1) } },
      { rot: { armR: 30, weapon: 185 }, trail: 50, off: { torso: o(0, 1), head: o(0, 1) } },
      { rot: { armR: 10, weapon: 90 } },
      {},
    ],
    side: [
      { rot: { armR: 40, weapon: -80 }, lean: -0.05 },
      { rot: { armR: 150, weapon: -210 }, lean: -0.06 },
      { rot: { armR: -80, weapon: 180 }, trail: 150, lean: 0.06, off: { torso: o(1, 0), head: o(1, 0) } },
      { rot: { armR: -50, weapon: 190 }, trail: 50, lean: 0.05, off: { torso: o(1, 0), head: o(1, 0) } },
      { rot: { armR: -20, weapon: 80 } },
      {},
    ],
    // facing away (north): the blade sweeps from the side up over the head – it strikes
    // forward, i.e. upwards in the picture (weapon arm is on the left here)
    back: [
      { rot: { armR: 60, weapon: -160 }, all: o(0, 1) },
      { rot: { armR: 100, weapon: -190 } },
      { rot: { armR: 170, weapon: -150 }, trail: 110, off: { torso: o(0, -1), head: o(0, -1) } },
      { rot: { armR: 200, weapon: -140 }, trail: 50, off: { torso: o(0, -1), head: o(0, -1) } },
      { rot: { armR: 40, weapon: -40 } },
      {},
    ],
  },
  {
    id: 'hurt',
    label: 'Treffer',
    kind: 'character',
    fps: 12,
    loop: false,
    hint: 'Weiß/rot aufblitzen, Kopf zuckt zurück, kurz zurückgestoßen',
    poses: [
      { flash: 'white', all: o(0, -1), squash: 0.92, rot: { head: 10 } },
      { flash: 'red', all: o(0, -1), rot: { head: 14, armL: 20, armR: -20, weapon: 15 } },
      { rot: { head: 6, armL: 10, armR: -10 } },
      {},
    ],
    side: [
      { flash: 'white', all: o(-2, 0), spin: -8, rot: { head: -12, armR: 30, weapon: -20 } },
      { flash: 'red', all: o(-2, 0), spin: -10, rot: { head: -14, armR: 40, weapon: -30 } },
      { all: o(-1, 0), spin: -4, rot: { head: -6, armR: 15 } },
      {},
    ],
  },
  {
    id: 'death',
    label: 'Umfallen',
    kind: 'character',
    fps: 10,
    loop: false,
    hint: 'Knickt ein, kippt um und bleibt liegen (letztes Bild bleibt stehen)',
    poses: [
      { flash: 'white', rot: { head: 12 }, squash: 0.94 },
      { spin: 12, rot: { head: 18, armL: 30, armR: -20 }, squash: 0.92 },
      { spin: 35, rot: { armL: 50, armR: -40, weapon: 30 } },
      { spin: 65, rot: { armL: 70, armR: -50, weapon: 40 } },
      { spin: 90, all: o(0, -1), rot: { armL: 60, armR: -60, weapon: 60 } },
      { spin: 90, rot: { armL: 40, armR: -40, weapon: 60 } },
    ],
    side: [
      { flash: 'white', rot: { head: -12 }, squash: 0.94 },
      { spin: -12, rot: { head: -18, armR: 40 }, squash: 0.92 },
      { spin: -35, rot: { armR: 70, weapon: -40, legR: -20 } },
      { spin: -65, rot: { armR: 90, weapon: -50, legR: -30 } },
      { spin: -90, all: o(0, -1), rot: { armR: 60, weapon: -40, legR: -20 } },
      { spin: -90, rot: { armR: 40, weapon: -30, legR: -10 } },
    ],
  },
  {
    id: 'cast',
    label: 'Zaubern',
    kind: 'character',
    fps: 8,
    loop: false,
    hint: 'Arme hoch, kurzes Aufleuchten',
    poses: [
      { rot: { armL: 40, armR: -40, weapon: 30 } },
      { rot: { armL: 120, armR: -120, weapon: 100 }, bright: 0.1 },
      { rot: { armL: 160, armR: -160, weapon: 150 }, off: { head: o(0, -1) }, bright: 0.25 },
      { rot: { armL: 60, armR: -60, weapon: 50 } },
    ],
    side: [
      { rot: { armR: -50, weapon: 40 } },
      { rot: { armR: -120, weapon: 100 }, bright: 0.1 },
      { rot: { armR: -150, weapon: 130 }, lean: -0.04, bright: 0.25 },
      { rot: { armR: -70, weapon: 50 } },
    ],
  },
  {
    id: 'block',
    label: 'Blocken',
    kind: 'character',
    fps: 10,
    loop: false,
    hint: 'Schild / zweite Hand nach vorn, leicht in die Knie',
    poses: [{ off: { armL: o(1, -1) } }, { off: { armL: o(2, -2), torso: o(0, 1), head: o(0, 1), armR: o(0, 1) } }, { off: { armL: o(2, -2), torso: o(0, 1), head: o(0, 1), armR: o(0, 1) } }],
    side: [
      { rot: { armR: -40, weapon: -30 }, lean: -0.04 },
      { rot: { armR: -70, weapon: -60 }, lean: -0.06, all: o(0, 1) },
      { rot: { armR: -70, weapon: -60 }, lean: -0.06, all: o(0, 1) },
    ],
  },
  {
    id: 'crouch',
    label: 'Ducken',
    kind: 'character',
    fps: 8,
    loop: false,
    hint: 'Geht in die Hocke (Schleichen, Deckung)',
    poses: [{ off: { head: o(0, 2), torso: o(0, 2), armL: o(0, 2), armR: o(0, 2) } }, { off: { head: o(0, 3), torso: o(0, 3), armL: o(0, 3), armR: o(0, 3) } }],
  },
  {
    id: 'wave',
    label: 'Winken',
    kind: 'character',
    fps: 6,
    loop: true,
    hint: 'Hand hoch und hin und her (NPC, Begrüßung)',
    poses: [{ rot: { armR: -150, weapon: 140 } }, { rot: { armR: -120, weapon: 110 } }, { rot: { armR: -155, weapon: 145 } }, { rot: { armR: -120, weapon: 110 } }],
    side: [{ rot: { armR: -150, weapon: 140 } }, { rot: { armR: -125, weapon: 115 } }, { rot: { armR: -155, weapon: 145 } }, { rot: { armR: -125, weapon: 115 } }],
  },
  {
    id: 'climb',
    label: 'Klettern',
    kind: 'character',
    fps: 6,
    loop: true,
    hint: 'Arme und Beine im Wechsel – am besten mit Ansicht „Hinten“ (Leiter, Ranken)',
    poses: [
      { rot: { armL: 160, armR: -120, weapon: 110 }, off: { legR: o(0, -2) } },
      { all: o(0, -1), rot: { armL: 140, armR: -140, weapon: 130 } },
      { rot: { armL: 120, armR: -160, weapon: 150 }, off: { legL: o(0, -2) } },
      { all: o(0, -1), rot: { armL: 140, armR: -140, weapon: 130 } },
    ],
  },
  {
    id: 'fall',
    label: 'Fallen',
    kind: 'character',
    fps: 8,
    loop: true,
    hint: 'Arme nach oben, Beine hängen (nach einem Sprung)',
    poses: [
      { squash: 1.05, rot: { armL: 140, armR: -140, weapon: 120 } },
      { squash: 1.05, rot: { armL: 155, armR: -155, weapon: 135 }, off: { legL: o(0, -1) } },
    ],
    side: [
      { squash: 1.05, rot: { armR: -150, weapon: 130, legR: -15, legL: 10 } },
      { squash: 1.05, rot: { armR: -165, weapon: 145, legR: -5, legL: 20 } },
    ],
  },
  // ---------------------------------------------------------------- creatures
  {
    id: 'k_idle',
    label: 'Wabern',
    kind: 'creature',
    fps: 5,
    loop: true,
    hint: 'Atmet, wird leicht flacher und wieder höher',
    poses: [{}, { squash: 0.94 }, { squash: 0.9 }, { squash: 0.94 }],
  },
  {
    id: 'k_hop',
    label: 'Hüpfen',
    kind: 'creature',
    fps: 10,
    loop: true,
    hint: 'Bewegung am Boden: stauchen, abspringen, landen – Schatten bleibt',
    poses: [{ squash: 0.84 }, { all: o(0, -2), squash: 1.08 }, { all: o(0, -4), squash: 1.04 }, { all: o(0, -2) }, { squash: 0.88 }],
  },
  {
    id: 'k_crawl',
    label: 'Krabbeln',
    kind: 'creature',
    fps: 10,
    loop: true,
    hint: 'Beine / Klauen im Wechsel (Spinne, Käfer, Wolf)',
    poses: [{ rot: { armL: 14, armR: 8 }, off: { armL: o(0, -1) } }, { all: o(0, 1) }, { rot: { armL: -8, armR: -14 }, off: { armR: o(0, -1) } }, { all: o(0, 1) }],
  },
  {
    id: 'k_fly',
    label: 'Fliegen',
    kind: 'creature',
    fps: 10,
    loop: true,
    hint: 'Flügelschlag und leichtes Auf und Ab',
    poses: [
      { all: o(0, -2), rot: { armL: 35, armR: -35 }, off: { armL: o(0, -1), armR: o(0, -1) } },
      { all: o(0, -1), rot: { armL: 12, armR: -12 } },
      { all: o(0, 1), rot: { armL: -28, armR: 28 }, off: { armL: o(0, 1), armR: o(0, 1) } },
      { rot: { armL: -8, armR: 8 } },
    ],
  },
  {
    id: 'k_attack',
    label: 'Angriff',
    kind: 'creature',
    fps: 12,
    loop: false,
    hint: 'Ausholen und zuschnappen / zuschlagen',
    poses: [
      { squash: 0.84, rot: { armL: -20, armR: 20 } },
      { all: o(0, -3), squash: 1.14, rot: { armL: 40, armR: -40 }, off: { armL: o(-1, -2), armR: o(1, -2) } },
      { all: o(0, 2), squash: 0.92, rot: { armL: -25, armR: 25 }, off: { head: o(0, 1) }, flash: 'white' },
      { all: o(0, 1), squash: 0.96 },
      {},
    ],
  },
  {
    id: 'k_hurt',
    label: 'Treffer',
    kind: 'creature',
    fps: 10,
    loop: false,
    hint: 'Weißer / roter Blitz und Zurückzucken',
    poses: [{ all: o(-1, 0), flash: 'white' }, { all: o(1, 0), flash: 'red' }, {}],
  },
  {
    id: 'k_death',
    label: 'Zerfallen',
    kind: 'creature',
    fps: 8,
    loop: false,
    hint: 'Sackt in sich zusammen und verblasst',
    poses: [{ squash: 0.8, flash: 'white' }, { squash: 0.6, alpha: 0.85 }, { squash: 0.4, alpha: 0.6 }, { squash: 0.25, alpha: 0.3 }],
  },
  // ---------------------------------------------------------------- objects
  {
    id: 'bob',
    label: 'Schweben',
    kind: 'object',
    fps: 6,
    loop: true,
    hint: 'Hebt und senkt sich, Schatten bleibt',
    poses: [{}, { all: o(0, -1) }, { all: o(0, -2) }, { all: o(0, -1) }],
  },
  {
    id: 'shake',
    label: 'Wackeln',
    kind: 'object',
    fps: 12,
    loop: true,
    hint: 'Zittert hin und her (Treffer, Falle)',
    poses: [{}, { spin: 6 }, { spin: 0, all: o(1, 0) }, { spin: -6 }, {}, { all: o(-1, 0) }],
  },
  {
    id: 'pulse',
    label: 'Pulsieren',
    kind: 'object',
    fps: 6,
    loop: true,
    hint: 'Wird heller und wieder dunkler (magisch, Sammelobjekt)',
    poses: [{}, { bright: 0.12 }, { bright: 0.24 }, { bright: 0.12 }],
  },
  {
    id: 'flicker',
    label: 'Flackern',
    kind: 'object',
    fps: 10,
    loop: true,
    hint: 'Effekte (Feuer, Funkeln) flackern, die Grundform bleibt',
    poses: [{ off: { effect: o(0, 0) } }, { off: { effect: o(0, -1) }, bright: 0.04 }, { off: { effect: o(1, 0) } }, { off: { effect: o(0, -1) }, hideEffects: false }],
  },
  {
    id: 'open',
    label: 'Öffnen',
    kind: 'object',
    fps: 8,
    loop: false,
    hint: 'Oberer Teil (Deckel) hebt sich – z. B. Truhe',
    poses: [{}, { off: { head: o(0, -1) } }, { off: { head: o(0, -2) } }, { off: { head: o(0, -3) }, bright: 0.08 }],
  },
];

export const animsFor = (kind: SpriteKind) => ANIMATIONS.filter((a) => a.kind === kind);

// ---------------------------------------------------------------- rendering

import { framePad, frameSize } from './frame';
export { framePad, frameSize };

export const DIR_NAME: Record<View, string> = { front: 'down', fside: 'down_side', side: 'side', bside: 'up_side', back: 'up' };
export const frameKey = (view: View, animId: string, i: number) => `${view}:${animId}:${i}`;

/** a front pose seen from behind: everything mirrored (the weapon hand is on the left there) */
function mirrorPose(p: Pose): Pose {
  const neg = <T extends Partial<Record<Region, number>>>(r: T | undefined) => (r ? (Object.fromEntries(Object.entries(r).map(([k, v]) => [k, -(v as number)])) as T) : undefined);
  const off = p.off && (Object.fromEntries(Object.entries(p.off).map(([k, v]) => [k, { x: -v!.x, y: v!.y }])) as Pose['off']);
  return { ...p, off, rot: neg(p.rot), spin: p.spin && -p.spin, all: p.all && { x: -p.all.x, y: p.all.y }, lean: p.lean && -p.lean, trail: p.trail && -p.trail };
}

/**
 * a side walk / run pose seen three-quarter: legs and arms swing less (part of the step goes
 * towards or away from the viewer), the other arm swings against the weapon arm
 */
function diagStep(p: Pose): Pose {
  const r = p.rot ?? {};
  const k = (v: number | undefined, f: number) => (v ? Math.round(v * f) : 0);
  return { ...p, lean: p.lean && p.lean * 0.5, hold: 0.85, rot: { ...r, legL: k(r.legL, 0.45), legR: k(r.legR, 0.45), armR: k(r.armR, 0.5), armL: -k(r.armR, 0.35) } };
}

/** poses of an animation for a view (side walk swings the legs, the back view mirrors the front) */
export function posesFor(anim: AnimDef, view: View): Pose[] {
  if (view === 'side') return anim.side ?? anim.poses;
  if (anim.kind === 'character') {
    // walking diagonally: the step of the side view, a little smaller
    if ((view === 'fside' || view === 'bside') && anim.side && (anim.id === 'walk' || anim.id === 'run')) return anim.side.map(diagStep);
    // characters hold the weapon in their right hand: left in the front picture, right from
    // behind. Poses are written with the weapon arm on the right → the front view is mirrored.
    if (frontish(view)) return anim.poses.map(mirrorPose);
    return anim.back ? anim.back.map(mirrorPose) : anim.poses;
  }
  if (isBackView(view)) return anim.back ?? anim.poses.map(mirrorPose);
  return anim.poses;
}

const SWAP: Partial<Record<Region, Region>> = { armL: 'armR', armR: 'armL', legL: 'legR', legR: 'legL' };

function regionOf(layer: SpriteLayer, x: number, y: number, kind: SpriteKind, b: Body, bounds: Bounds, c: Creature): Region {
  const r = regionRaw(layer, x, y, kind, b, bounds, c);
  // characters: seen from the front the left of the picture is the figure's right side
  // (weapon hand); creatures: mirrored from behind
  const flip = kind === 'character' ? frontish(b.view) : isBackView(c.view);
  return flip ? (SWAP[r] ?? r) : r;
}

function regionRaw(layer: SpriteLayer, x: number, y: number, kind: SpriteKind, b: Body, bounds: Bounds, c: Creature): Region {
  const slot = layer.slot;
  if (slot === 'shadow') return 'ground';
  if (kind === 'object') {
    if (slot === 'effect') return 'effect';
    // "head" of an object = upper third (lid)
    return y < bounds.y0 + (bounds.y1 - bounds.y0) * 0.38 ? 'head' : 'torso';
  }
  if (kind === 'creature') {
    if (slot === 'aura') return 'effect';
    if (slot === 'back' || slot === 'limbs') return x < c.cx ? 'armL' : 'armR';
    if (slot === 'eyes' || slot === 'mouth' || slot === 'horns') return 'head';
    return 'torso';
  }
  // weapon: its own region (turns around the grip), always in the figure's right hand
  if (slot === 'weapon') return 'weapon';
  // the other hand (shield …): right in the front picture, left from behind
  if (slot === 'offhand') return frontish(b.view) ? 'armR' : 'armL';
  if (slot === 'hair' || slot === 'hat' || slot === 'face' || slot === 'headx') return 'head';
  if (slot === 'back') return 'torso';
  if (y < b.t[1]) return 'head';
  if (y >= b.ly[0]) return x < b.hx ? 'legL' : 'legR';
  // from the side the one visible arm swings with the weapon
  if (b.view === 'side' && x >= b.aR[0] - 1 && x <= b.aR[1] + 1 && y >= b.ay[0]) return 'armR';
  if (x <= b.aL[1] && y >= b.ay[0]) return 'armL';
  if (x >= b.aR[0] && y >= b.ay[0]) return 'armR';
  return 'torso';
}

type Pt = [number, number];

/** pivot of each region in design coordinates (after the back-view swap) */
function pivots(kind: SpriteKind, b: Body, bounds: Bounds, c: Creature): Partial<Record<Region, Pt>> {
  if (kind === 'object') {
    const hy = bounds.y0 + (bounds.y1 - bounds.y0) * 0.38;
    return { head: [bounds.x0, hy], torso: [(bounds.x0 + bounds.x1 + 1) / 2, bounds.y1 + 1] };
  }
  if (kind === 'creature') {
    const back = isBackView(c.view);
    const l: Pt = [c.cx - c.rx * 0.6, c.cy];
    const r: Pt = [c.cx + c.rx * 0.6, c.cy];
    return { armL: back ? r : l, armR: back ? l : r, head: [c.cx, c.cy], torso: [c.cx, c.ground + 1] };
  }
  const flip = frontish(b.view); // weapon arm on the left of the picture
  const arm = (a: [number, number]): Pt => [(a[0] + a[1] + 1) / 2, b.ay[0] + 1];
  const leg = (l: [number, number]): Pt => [(l[0] + l[1] + 1) / 2, b.ly[0]];
  // the fist that holds the weapon (see weaponHand() in parts/character.ts)
  const h = weaponHand(b);
  return {
    armL: arm(flip ? b.aR : b.aL),
    armR: arm(flip ? b.aL : b.aR),
    legL: leg(flip ? b.lR : b.lL),
    legR: leg(flip ? b.lL : b.lR),
    head: [b.hx, b.t[1]],
    torso: [b.hx, b.ly[0]],
    weapon: [h.cx, h.hy],
  };
}

function rotAbout(x: number, y: number, c: Pt, deg: number): Pt {
  const a = (deg * Math.PI) / 180;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  const dx = x - c[0];
  const dy = y - c[1];
  return [c[0] + dx * cs - dy * sn, c[1] + dx * sn + dy * cs];
}

/** feet row inside a frame */
export function feetInFrame(doc: SpriteDoc, view: View = 'front'): number {
  const n = doc.size;
  const d = Math.floor((n - S) / 2);
  const { body, bounds, creature } = fitContext(doc, view);
  return (doc.kind === 'character' ? body.ly[1] : doc.kind === 'creature' ? creature.ground : bounds.y1) + d + framePad(n);
}

// sub-pixel samples for rotated pixels (no holes in turned arms / weapons)
const SUB = [1 / 6, 1 / 2, 5 / 6];

/** One frame as RGBA (frameSize × frameSize, sprite centred). */
export function renderFrame(doc: SpriteDoc, pose: Pose, view: View = 'front'): Uint8ClampedArray {
  const n = doc.size;
  const p = framePad(n);
  const F = frameSize(n);
  const d = Math.floor((n - S) / 2); // design grid → canvas
  const k = d + p; // design grid → frame
  const { body, bounds, creature } = fitContext(doc, view);
  const feet = feetInFrame(doc, view);
  const piv = pivots(doc.kind, body, bounds, creature);
  const pv = (r: Region): Pt => {
    const q = piv[r] ?? [S / 2, S / 2];
    return [q[0] + k, q[1] + k];
  };
  const rot = pose.rot ?? {};
  const rest = doc.kind === 'character' ? weaponRest(doc.layers.find((l) => l.slot === 'weapon')?.partId, view) : 0;
  const turned = !!pose.spin || Object.entries(rot).some(([r, v]) => (r === 'weapon' ? v !== rest : !!v));
  const spinC: Pt = [F / 2, feet + 1];

  /** frame position of a point of a region (continuous coordinates) */
  const place = (r: Region, x: number, y: number): Pt => {
    let q: Pt = [x, y];
    let ox = 0;
    let oy = 0;
    let base = r;
    if (r === 'weapon') {
      // pose angles count from an upright weapon; drawn weapons already lean by `rest`
      if (rot.weapon !== undefined && rot.weapon !== rest) q = rotAbout(q[0], q[1], pv('weapon'), rot.weapon - rest);
      else if (rot.weapon === undefined && pose.hold && rot.armR) q = rotAbout(q[0], q[1], pv('weapon'), -pose.hold * rot.armR);
      ox += pose.off?.weapon?.x ?? 0;
      oy += pose.off?.weapon?.y ?? 0;
      base = 'armR';
    }
    if (rot[base]) q = rotAbout(q[0], q[1], pv(base), rot[base]!);
    ox += pose.off?.[base]?.x ?? 0;
    oy += pose.off?.[base]?.y ?? 0;
    q = [q[0] + ox, q[1] + oy];
    if (r !== 'ground') {
      q = [q[0] + (pose.all?.x ?? 0), q[1] + (pose.all?.y ?? 0)];
      if (pose.lean) q[0] += Math.round((feet - y) * pose.lean);
      if (pose.spin) q = rotAbout(q[0], q[1], spinC, pose.spin);
    }
    return q;
  };

  const vis = viewLayers(doc, view).filter((l) => l.visible && !(pose.hideEffects && (l.slot === 'effect' || l.slot === 'aura')));
  const regionAt = (l: SpriteLayer, x: number, y: number) => regionOf(l, x - d, y - d, doc.kind, body, bounds, creature);

  // a figure turned far over rests on the ground instead of sinking into it
  let lift = 0;
  if (pose.spin && Math.abs(pose.spin) >= 45) {
    let maxY = -1;
    for (const l of vis)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          if (!l.data[(y * n + x) * 4 + 3]) continue;
          const r = regionAt(l, x, y);
          if (r !== 'ground') maxY = Math.max(maxY, place(r, x + p + 0.5, y + p + 0.5)[1]);
        }
    if (maxY > feet + 1) lift = Math.floor(feet + 1 - maxY);
  }

  // swinging the side arm leaves a gap in the torso – fill it with the torso next to it
  const fillArm = view === 'side' && doc.kind === 'character' && !!rot.armR;
  // weapon tip (for the motion trail)
  let tip: Pt | null = null;
  let tipD = -1;
  const armC = pose.trail ? place('armR', pv('armR')[0], pv('armR')[1]) : null;

  const layers: SpriteLayer[] = [];
  for (const l of vis) {
    const out = new Uint8ClampedArray(F * F * 4);
    const put = (tx: number, ty: number, s: number, r?: Region) => {
      tx = Math.floor(tx);
      ty = Math.floor(ty + (r === 'ground' ? 0 : lift));
      if (tx < 0 || ty < 0 || tx >= F || ty >= F) return;
      out.set(l.data.subarray(s, s + 4), (ty * F + tx) * 4);
    };
    if (fillArm)
      for (let y = 0; y < n; y++) {
        const dy = y - d;
        if (dy < body.t[1] || dy > body.t[3]) continue;
        const sx = body.aR[0] - 2 + d;
        const src = (y * n + sx) * 4;
        if (sx < 0 || !l.data[src + 3] || regionAt(l, sx, y) !== 'torso') continue;
        for (let x = body.aR[0] - 1 + d; x <= body.aR[1] + 1 + d; x++) {
          if (x - d > body.t[2] || !l.data[(y * n + x) * 4 + 3] || regionAt(l, x, y) !== 'armR') continue;
          const q = place('torso', x + p + 0.5, y + p + 0.5);
          put(q[0], q[1], src);
        }
      }
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const s = (y * n + x) * 4;
        if (!l.data[s + 3]) continue;
        const r = regionAt(l, x, y);
        if (!turned) {
          const q = place(r, x + p, y + p);
          put(Math.round(q[0]), Math.round(q[1]), s, r);
          continue;
        }
        for (const u of SUB)
          for (const v of SUB) {
            const q = place(r, x + p + u, y + p + v);
            put(q[0], q[1], s, r);
          }
        if (armC && (r === 'weapon' || r === 'armR')) {
          const q = place(r, x + p + 0.5, y + p + 0.5);
          const dd = Math.hypot(q[0] - armC[0], q[1] - armC[1]) + (r === 'weapon' ? 100 : 0);
          if (dd > tipD) (tipD = dd), (tip = q);
        }
      }
    layers.push({ ...l, data: out });
  }
  let img = compose({ ...doc, size: F, layers });
  if (pose.trail && tip && armC) drawTrail(img, F, armC, tip, pose.trail, lift);
  if (pose.squash && pose.squash !== 1) img = squash(img, F, feet, pose.squash);
  if (pose.flash || pose.bright) {
    for (let i = 0; i < img.length; i += 4) {
      if (!img[i + 3] || img[i + 3] < 128) continue;
      if (pose.flash === 'white') img.set(shiftColor(img[i], img[i + 1], img[i + 2], 0.7), i);
      else if (pose.flash === 'red') img.set([Math.min(255, img[i] + 90), img[i + 1] * 0.55, img[i + 2] * 0.55], i);
      if (pose.bright) img.set(shiftColor(img[i], img[i + 1], img[i + 2], pose.bright), i);
    }
  }
  if (pose.dust) {
    const fx = F / 2 - 4;
    for (let k = 0; k < pose.dust; k++) {
      const cx = Math.round(fx - 3 - k * 3);
      const cy = feet - (k % 2);
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, -1],
        [1, -1],
      ]) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= F || y >= F) continue;
        const i = (y * F + x) * 4;
        if (!img[i + 3]) img.set([200, 190, 175, 200 - k * 40], i);
      }
    }
  }
  if (pose.lie) img = lieDown(img, F, feet);
  if (pose.alpha !== undefined) for (let i = 3; i < img.length; i += 4) img[i] = Math.round(img[i] * pose.alpha);
  return img;
}

/** light arc behind the weapon tip – shows the swing in a single frame */
function drawTrail(img: Uint8ClampedArray, F: number, c: Pt, tip: Pt, deg: number, lift: number) {
  const R = Math.hypot(tip[0] - c[0], tip[1] - c[1]);
  if (R < 4) return;
  const a0 = Math.atan2(tip[1] - c[1], tip[0] - c[0]);
  const span = (Math.abs(deg) * Math.PI) / 180;
  const dir = deg > 0 ? -1 : 1; // the trail lies where the tip came from
  const steps = Math.ceil(span * R * 2);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + dir * span * t;
    // thick near the tip, thin at the end
    const w = Math.max(1, Math.round(3 * (1 - t)));
    for (let j = 0; j < w; j++) {
      const r = R - 0.5 - j;
      const x = Math.floor(c[0] + Math.cos(a) * r);
      const y = Math.floor(c[1] + lift + Math.sin(a) * r);
      if (x < 0 || y < 0 || x >= F || y >= F) continue;
      const q = (y * F + x) * 4;
      if (img[q + 3] > 100) continue;
      img.set([255, 250, 235, Math.round(230 * (1 - t * 0.8))], q);
    }
  }
}

/** squash (< 1) / stretch (> 1) towards the feet line, width changes the other way */
function squash(img: Uint8ClampedArray, n: number, feet: number, s: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(img.length);
  const cx = n / 2;
  const wx = 1 / Math.sqrt(s);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const sy = Math.round(feet - (feet - y) / s);
      const sx = Math.floor(cx + (x + 0.5 - cx) / wx);
      if (sx < 0 || sy < 0 || sx >= n || sy >= n || sy > feet + 3) continue;
      const i = (sy * n + sx) * 4;
      if (img[i + 3]) out.set(img.subarray(i, i + 4), (y * n + x) * 4);
    }
  return out;
}

/** rotate 90° clockwise so the figure lies on the ground (centred, resting on the feet line) */
function lieDown(img: Uint8ClampedArray, n: number, feet: number): Uint8ClampedArray {
  let x0 = n,
    x1 = -1,
    y0 = n,
    y1 = -1;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (img[(y * n + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  const out = new Uint8ClampedArray(img.length);
  if (x1 < 0) return out;
  const shiftX = Math.round(n / 2 - (y1 - y0) / 2);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const s = (y * n + x) * 4;
      if (!img[s + 3]) continue;
      // head to the right, lying on the ground
      const tx = y1 - y + shiftX;
      const ty = feet - (x1 - x);
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
      out.set(img.subarray(s, s + 4), (ty * n + tx) * 4);
    }
  return out;
}


/** frames of a built-in animation (hand-edited frames win) or of an own animation */
export function framesOf(doc: SpriteDoc, anim: AnimDef | CustomAnim, view: View = 'front'): Uint8ClampedArray[] {
  if ('frames' in anim) return anim.frames;
  return posesFor(anim, view).map((p, i) => doc.frames?.[frameKey(view, anim.id, i)] ?? renderFrame(doc, p, view));
}

export function renderAnimation(doc: SpriteDoc, anim: AnimDef, view: View = 'front'): Uint8ClampedArray[] {
  return framesOf(doc, anim, view);
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'anim';

/** animation name in exports: creature ids lose their prefix (k_hop → hop) */
export const exportName = (id: string) => id.replace(/^k_/, '');

export interface SheetRow {
  name: string;
  animId: string;
  view: View;
  row: number;
  frames: number;
  loop: boolean;
  fps: number;
}

/**
 * Spritesheet: one row per animation (and direction), frames left to right.
 * With several directions the rows are called walk_down, walk_side, walk_up …
 */
export function buildSheet(doc: SpriteDoc, anims: AnimDef[], views: View[] = ['front'], custom: CustomAnim[] = [], fps: Record<string, number> = {}): { canvas: HTMLCanvasElement; rows: SheetRow[]; cols: number } {
  const n = frameSize(doc.size);
  const items: { name: string; animId: string; view: View; frames: Uint8ClampedArray[]; loop: boolean; fps: number }[] = [];
  const multi = views.length > 1;
  for (const view of views)
    for (const a of anims) items.push({ name: multi ? `${exportName(a.id)}_${DIR_NAME[view]}` : exportName(a.id), animId: a.id, view, frames: framesOf(doc, a, view), loop: a.loop, fps: fps[a.id] ?? a.fps });
  for (const a of custom) items.push({ name: multi || a.view !== 'front' ? `${slug(a.name)}_${DIR_NAME[a.view]}` : slug(a.name), animId: a.id, view: a.view, frames: a.frames, loop: a.loop, fps: a.fps });
  const cols = Math.max(1, ...items.map((i) => i.frames.length));
  const c = document.createElement('canvas');
  c.width = cols * n;
  c.height = Math.max(1, items.length) * n;
  const g = c.getContext('2d')!;
  const rows = items.map((it, row) => {
    it.frames.forEach((f, i) => g.putImageData(new ImageData(new Uint8ClampedArray(f), n, n), i * n, row * n));
    return { name: it.name, animId: it.animId, view: it.view, row, frames: it.frames.length, loop: it.loop, fps: it.fps };
  });
  return { canvas: c, rows, cols };
}
