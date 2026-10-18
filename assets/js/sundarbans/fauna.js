import * as THREE from 'three';

export function createFauna() {
  return { group: new THREE.Group(), update() {} };
}
