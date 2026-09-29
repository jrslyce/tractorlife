// Lightweight decorative environment for the shared farm world.
// Geometry is intentionally non-interactive: gameplay/collision stays in the
// farm/world systems. Coordinates assume ground at y=0, farms z=-54..28 and
// the road centered at z=35; the scenery is kept north of the fields or south
// of the road so it never obscures plots, spawn areas, or traffic.
import * as THREE from 'three';

const DEFAULT_BOUNDS = { minX: -10, maxX: 1770, minZ: -78, maxZ: 80 };

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Add decorative river and woodland dressing to a scene. */
export function buildEnvironment(scene, worldBounds = {}) {
  const bounds = { ...DEFAULT_BOUNDS, ...worldBounds };
  const minX = Number.isFinite(bounds.minX) ? bounds.minX : DEFAULT_BOUNDS.minX;
  const maxX = Number.isFinite(bounds.maxX) ? bounds.maxX : DEFAULT_BOUNDS.maxX;
  const minZ = Number.isFinite(bounds.minZ) ? bounds.minZ : DEFAULT_BOUNDS.minZ;
  const maxZ = Number.isFinite(bounds.maxZ) ? bounds.maxZ : DEFAULT_BOUNDS.maxZ;
  const spanX = maxX - minX;
  const group = new THREE.Group();
  group.name = 'world-environment';
  scene.add(group);

  const disposables = [];
  const material = (color, roughness = 1) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness });
    disposables.push(mat);
    return mat;
  };

  // River follows the north map edge (around z=-70), leaving a broad buffer
  // from northern farm plots. A bank pair, water strip, and sparse reeds give
  // scale without introducing a long, expensive custom mesh.
  const riverZ = minZ + Math.max(8, Math.min(12, (maxZ - minZ) * 0.075));
  const riverWidth = 7;
  const bankMat = material(0x777b56);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x438eaa, roughness: 0.3, metalness: 0.05,
    transparent: true, opacity: 0.88
  });
  disposables.push(waterMat);
  const bankGeo = new THREE.BoxGeometry(spanX + 8, 0.16, riverWidth + 3);
  const bank = new THREE.Mesh(bankGeo, bankMat);
  bank.position.set((minX + maxX) / 2, 0.015, riverZ);
  group.add(bank);
  const waterGeo = new THREE.PlaneGeometry(spanX + 4, riverWidth);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set((minX + maxX) / 2, 0.12, riverZ);
  group.add(water);
  disposables.push(bankGeo, waterGeo);

  // A single low-cost shader-free wave texture effect: tiny repeated ripples
  // are represented by a few animated translucent strips, not per-frame mesh
  // rebuilding. World-space placement stays along the same edge river.
  const rippleMat = new THREE.MeshBasicMaterial({
    color: 0xa4e5e5, transparent: true, opacity: 0.32,
    depthWrite: false, side: THREE.DoubleSide
  });
  disposables.push(rippleMat);
  const rippleGeo = new THREE.PlaneGeometry(8, 0.12);
  disposables.push(rippleGeo);
  const ripples = [];
  const rippleCount = Math.max(8, Math.floor(spanX / 90));
  for (let i = 0; i < rippleCount; i++) {
    const mesh = new THREE.Mesh(rippleGeo, rippleMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(minX + (i + 0.5) * spanX / rippleCount, 0.135, riverZ + (i % 3 - 1) * 1.5);
    group.add(mesh);
    ripples.push(mesh);
  }

  // Tree instances use shared low-poly geometries and compact per-instance
  // transforms. Deterministic placement makes the woodland stable between runs.
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 3.2, 6);
  const crownGeo = new THREE.ConeGeometry(2.0, 5.0, 7);
  const roundGeo = new THREE.IcosahedronGeometry(2.0, 1);
  disposables.push(trunkGeo, crownGeo, roundGeo);
  const trunkMat = material(0x72513a);
  const pineMat = material(0x315c3c);
  const pineLightMat = material(0x47764a);
  const broadMat = material(0x56804a);
  const broadLightMat = material(0x719252);

  const rand = seededRandom(0x41f29a7);
  const treeRecords = [[], [], [], [], []];
  const addTree = (x, z) => {
    const height = 0.78 + rand() * 0.52;
    const scale = 0.8 + rand() * 0.55;
    const broadleaf = rand() > 0.48;
    const variant = rand() > 0.58 ? 1 : 0;
    treeRecords[0].push({ x, z, height, scale });
    treeRecords[broadleaf ? (variant ? 4 : 3) : (variant ? 2 : 1)].push({ x, z, height, scale });
  };

  // North woodland is set between river and field northern edge (z=-54),
  // avoiding the river banks. South woodland sits beyond the road with a
  // clear shoulder; occasional openings prevent a visually solid wall.
  const bands = [
    { z0: riverZ + riverWidth / 2 + 2, z1: -57, spacing: 13 },
    { z0: 44, z1: maxZ - 3, spacing: 14 }
  ];
  for (const band of bands) {
    const rows = Math.max(1, Math.floor((band.z1 - band.z0) / band.spacing));
    for (let row = 0; row < rows; row++) {
      const z = band.z0 + (row + 0.5) * (band.z1 - band.z0) / rows;
      const step = band.spacing * (0.8 + rand() * 0.45);
      for (let x = minX + 4 + rand() * 4; x < maxX - 2; x += step) {
        if (rand() < 0.12) continue; // natural clearings
        addTree(x, z + (rand() - 0.5) * 3);
      }
    }
  }
  // Small groves at farm-to-farm gaps, always outside the fenced farm strip.
  const farmSpacing = 180;
  for (let x = minX + 164; x < maxX; x += farmSpacing) {
    for (let j = 0; j < 3; j++) {
      const z = 44 + rand() * Math.max(1, maxZ - 48);
      addTree(x + (rand() - 0.5) * 10, z);
    }
  }

  const dummy = new THREE.Object3D();
  const meshes = [];
  function createInstances(geometry, mat, records, kind) {
    if (!records.length) return;
    const mesh = new THREE.InstancedMesh(geometry, mat, records.length);
    mesh.name = `environment-${kind}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (let i = 0; i < records.length; i++) {
      const t = records[i];
      const yaw = rand() * Math.PI * 2;
      if (kind === 'trunks') {
        dummy.position.set(t.x, 1.6 * t.height, t.z);
        dummy.scale.set(t.scale, t.height, t.scale);
      } else {
        const isPine = kind.startsWith('pine');
        dummy.position.set(t.x, (isPine ? 5.1 : 3.7) * t.height, t.z);
        dummy.scale.set(t.scale, t.scale * (isPine ? 1.1 : 0.86), t.scale);
      }
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    meshes.push(mesh);
  }
  createInstances(trunkGeo, trunkMat, treeRecords[0], 'trunks');
  createInstances(crownGeo, pineMat, treeRecords[1], 'pine-dark');
  createInstances(crownGeo, pineLightMat, treeRecords[2], 'pine-light');
  createInstances(roundGeo, broadMat, treeRecords[3], 'canopy-dark');
  createInstances(roundGeo, broadLightMat, treeRecords[4], 'canopy-light');

  let elapsed = 0;
  return {
    update(dt, climateState) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      elapsed += Math.min(dt, 0.1);
      // Weather only nudges the water surface visually for now; the banks and
      // walkable world remain unchanged until flooding gameplay is introduced.
      const levelOffset = climateState && Number.isFinite(climateState.riverLevel)
        ? (climateState.riverLevel - 0.35) * 0.35
        : climateState && Number.isFinite(climateState.riverLevelModifier)
          ? climateState.riverLevelModifier * 0.2 : 0;
      water.position.y = 0.12 + levelOffset;
      // Gentle drift along the river; only transforms change, no allocations.
      for (let i = 0; i < ripples.length; i++) {
        const ripple = ripples[i];
        const phase = elapsed * 0.22 + i * 1.7;
        ripple.position.x = minX + ((i / ripples.length * spanX + phase * 3) % spanX);
        ripple.position.y = 0.135 + levelOffset;
        ripple.material.opacity = 0.2 + 0.12 * (0.5 + 0.5 * Math.sin(phase));
      }
    },
    dispose() {
      scene.remove(group);
      group.traverse((object) => {
        if (object.isMesh && !meshes.includes(object)) object.geometry?.dispose();
      });
      for (const resource of disposables) resource.dispose();
    }
  };
}
