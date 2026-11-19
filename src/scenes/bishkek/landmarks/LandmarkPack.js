import * as THREE from 'three';
import { createAlaTooSquare } from './AlaTooSquare.js';
import { createManasMonument } from './ManasMonument.js';
import { createPhilharmonic } from './Philharmonic.js';

export function buildLandmarkPack(groundHeightAt) {
  if (typeof groundHeightAt !== 'function') throw new TypeError('Landmark pack requires groundHeightAt');
  const group = new THREE.Group();
  group.name = 'bishkek-landmark-pack';

  const square = createAlaTooSquare(groundHeightAt);
  const philharmonic = createPhilharmonic(groundHeightAt);
  const manas = createManasMonument(groundHeightAt);
  group.add(square, philharmonic, manas);

  const colliders = [philharmonic.userData.collider, manas.userData.collider];
  const update = (elapsed) => square.userData.update(elapsed);
  return { group, landmarks: { square, philharmonic, manas }, colliders, update };
}
