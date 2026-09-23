/** frames get a margin so jumps, swings and falling fit: 32 px sprite → 48 px frames */
export const framePad = (size: number) => Math.round(size / 4);
export const frameSize = (size: number) => size + 2 * framePad(size);
