import { RESERVES } from '../data.js';

function reserveCenter(id) {
  const reserve = RESERVES.find((entry) => entry.id === id);
  if (!reserve) throw new Error(`Missing Bishkek reserve: ${id}`);
  return Object.freeze({ x: reserve.x + reserve.w / 2, z: reserve.z + reserve.d / 2 });
}

export const LANDMARK_LOCATIONS = Object.freeze({
  alaTooSquare: reserveCenter('alaToo'),
  philharmonic: reserveCenter('philharmonic'),
  // Keep the existing CityKit monument anchor rather than introducing a new map coordinate.
  manasMonument: Object.freeze({ x: 0, z: 4 }),
});
