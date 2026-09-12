import * as THREE from 'three';
import { isRelicCollected } from '../core/rules';
import type { BoardDefinition, GameState } from '../core/types';

export type SceneTheme = 'forest' | 'coast' | 'frost';

const palettes = {
  forest: { floor: 0xded4a7, stone: 0x969b77, moss: 0x557c43, earth: 0x344b35, edge: 0x788255 },
  coast: { floor: 0xebd6a2, stone: 0xb8b09a, moss: 0x688c66, earth: 0x346764, edge: 0x7ba093 },
  frost: { floor: 0xdae9e7, stone: 0x9daeb2, moss: 0x87b6ac, earth: 0x456272, edge: 0x9cbabe },
};

interface Motion {
  object: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  started: number;
  duration: number;
  hop: number;
}
interface Collectible {
  cell: number;
  kind: 'key' | 'relic';
  object: THREE.Group;
}

/** Physical scenery is decorative; all movement and collection decisions come from core/rules. */
export function createBoardWorld(
  board: BoardDefinition,
  theme: SceneTheme,
  invalidate: () => void,
) {
  const palette = palettes[theme];
  const group = new THREE.Group();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const geometryCache = new Map<string, THREE.BufferGeometry>();
  const materialCache = new Map<string, THREE.MeshStandardMaterial>();
  let disposed = false;
  let activeUntil = 0;
  let previous: GameState | undefined;
  let victory = false;
  const motions: Motion[] = [];
  const collectibles: Collectible[] = [];
  const doors: THREE.Group[] = [];
  let doorMotion: { from: number; to: number; started: number } | null = null;
  const portals: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  const waterRipples: THREE.Mesh[] = [];
  const crates = new Map<number, THREE.Group>();
  // Small deterministic material textures are generated locally, with no network assets.
  // They add mineral grain and timber fibers without increasing mesh or draw counts.
  function surfaceTexture(wood: boolean) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const pixels = context.createImageData(96, 96);
    for (let y = 0; y < 96; y++) {
      for (let x = 0; x < 96; x++) {
        const seed = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        const grain = seed - Math.floor(seed);
        const veins = wood
          ? Math.sin(x * 1.6 + Math.sin(y * 0.08) * 1.8)
          : Math.sin(x * 0.18) * Math.cos(y * 0.13);
        const value = Math.round(218 + grain * 26 + veins * (wood ? 12 : 7));
        const index = (y * 96 + x) * 4;
        pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
        pixels.data[index + 3] = 255;
      }
    }
    context.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    textures.add(texture);
    const bump = texture.clone();
    bump.colorSpace = THREE.NoColorSpace;
    textures.add(bump);
    return { texture, bump };
  }
  const stoneGrain = surfaceTexture(false);
  const timberGrain = surfaceTexture(true);
  const stoneColors = new Set([palette.floor, palette.stone, palette.edge, 0xa6ac82, 0xe5f4ee]);
  const timberColors = new Set([
    0x755332, 0xb28a51, 0xc39a61, 0xd0ab76, 0xa47e4c, 0x855b31, 0x9d743e, 0xbd985f, 0xa8814c,
  ]);

  function material(color: number, roughness = 0.85, metalness = 0) {
    const key = `${color}/${roughness}/${metalness}`;
    let value = materialCache.get(key);
    if (!value) {
      value = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      const surface = stoneColors.has(color)
        ? stoneGrain
        : timberColors.has(color)
          ? timberGrain
          : null;
      if (surface) {
        value.map = surface.texture;
        value.bumpMap = surface.bump;
        value.bumpScale = stoneColors.has(color) ? 0.024 : 0.012;
      }
      materialCache.set(key, value);
      materials.add(value);
    }
    return value;
  }
  function geometry(key: string, create: () => THREE.BufferGeometry) {
    let value = geometryCache.get(key);
    if (!value) {
      value = create();
      geometryCache.set(key, value);
      geometries.add(value);
    }
    return value;
  }
  function mesh(
    parent: THREE.Object3D,
    shape: THREE.BufferGeometry,
    surface: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const object = new THREE.Mesh(shape, surface);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(
    parent: THREE.Object3D,
    width: number,
    height: number,
    depth: number,
    color: number,
    x = 0,
    y = 0,
    z = 0,
  ) {
    return mesh(
      parent,
      geometry(`box${width}/${height}/${depth}`, () => new THREE.BoxGeometry(width, height, depth)),
      material(color),
      x,
      y,
      z,
    );
  }
  function roundBox(
    parent: THREE.Object3D,
    width: number,
    height: number,
    depth: number,
    color: number,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const shape = geometry(`round${width}/${height}/${depth}`, () => {
      const radius = Math.min(0.045, height / 4);
      const outline = new THREE.Shape();
      const left = -width / 2 + radius,
        right = width / 2 - radius;
      const bottom = -depth / 2 + radius,
        top = depth / 2 - radius;
      outline.moveTo(left, -depth / 2);
      outline.lineTo(right, -depth / 2);
      outline.quadraticCurveTo(width / 2, -depth / 2, width / 2, bottom);
      outline.lineTo(width / 2, top);
      outline.quadraticCurveTo(width / 2, depth / 2, right, depth / 2);
      outline.lineTo(left, depth / 2);
      outline.quadraticCurveTo(-width / 2, depth / 2, -width / 2, top);
      outline.lineTo(-width / 2, bottom);
      outline.quadraticCurveTo(-width / 2, -depth / 2, left, -depth / 2);
      const result = new THREE.ExtrudeGeometry(outline, {
        depth: height - radius * 2,
        bevelEnabled: true,
        bevelSize: radius / 2,
        bevelThickness: radius,
        bevelSegments: 1,
        steps: 1,
        curveSegments: 2,
      });
      result.rotateX(-Math.PI / 2);
      result.translate(0, -height / 2 + radius, 0);
      return result;
    });
    return mesh(parent, shape, material(color), x, y, z);
  }
  function position(cell: number, y = 0) {
    return new THREE.Vector3(
      (cell % board.width) - (board.width - 1) / 2,
      y,
      Math.floor(cell / board.width) - (board.height - 1) / 2,
    );
  }
  function leaves(parent: THREE.Object3D, x: number, y: number, z: number, seed: number) {
    const leaf = geometry('leaf', () => new THREE.SphereGeometry(0.12, 5, 3));
    for (let n = 0; n < 3; n++) {
      const angle = seed + n * 2.1;
      const part = mesh(
        parent,
        leaf,
        material(n % 2 ? palette.moss : 0x8ba657),
        x + Math.cos(angle) * 0.045,
        y + 0.045,
        z + Math.sin(angle) * 0.045,
      );
      part.scale.set(0.48, 0.38, 1.2);
      part.rotation.set(-0.4, angle, 0);
    }
  }
  function createCrate() {
    const crate = new THREE.Group();
    roundBox(crate, 0.61, 0.58, 0.61, 0x755332, 0, 0.31);
    for (let n = 0; n < 4; n++) {
      const offset = (n - 1.5) * 0.148;
      box(crate, 0.135, 0.51, 0.026, n % 2 ? 0xb28a51 : 0xc39a61, offset, 0.32, 0.318);
      box(crate, 0.026, 0.51, 0.135, n % 2 ? 0xb28a51 : 0xc39a61, 0.318, 0.32, offset);
      box(crate, 0.135, 0.026, 0.6, n % 2 ? 0xb28a51 : 0xc39a61, offset, 0.61);
    }
    for (const side of [-1, 1]) {
      box(crate, 0.67, 0.07, 0.047, 0xd0ab76, 0, 0.1, side * 0.335);
      box(crate, 0.67, 0.07, 0.047, 0xd0ab76, 0, 0.53, side * 0.335);
      box(crate, 0.047, 0.48, 0.65, 0xa47e4c, side * 0.335, 0.31);
    }
    const brace = box(crate, 0.08, 0.68, 0.045, 0xd0ab76, 0, 0.32, 0.35);
    brace.rotation.z = -Math.PI / 4;
    for (const x of [-0.27, 0.27]) {
      for (const y of [0.1, 0.53]) {
        mesh(
          crate,
          geometry('nail', () => new THREE.SphereGeometry(0.018, 5, 3)),
          material(0x544d40, 0.45, 0.4),
          x,
          y,
          0.365,
        );
      }
    }
    return crate;
  }
  function arch(parent: THREE.Group, exit: boolean) {
    for (const side of [-1, 1]) {
      for (let course = 0; course < 3; course++) {
        roundBox(parent, 0.2, 0.23, 0.32, palette.stone, side * 0.33, 0.15 + course * 0.235);
      }
      roundBox(parent, 0.25, 0.08, 0.39, palette.floor, side * 0.33, 0.06);
    }
    for (let wedge = 0; wedge < 7; wedge++) {
      const angle = (wedge / 6) * Math.PI;
      const stone = roundBox(
        parent,
        0.2,
        0.2,
        0.33,
        wedge % 2 ? palette.floor : palette.stone,
        Math.cos(angle) * 0.33,
        0.7 + Math.sin(angle) * 0.33,
      );
      stone.rotation.z = angle - Math.PI / 2;
    }
    leaves(parent, -0.3, 0.87, 0.07, 2);
    if (exit) {
      const surface = new THREE.MeshBasicMaterial({
        color: theme === 'frost' ? 0xa2f6ff : 0xf8d47c,
        transparent: true,
        opacity: 0.48,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      materials.add(surface);
      const portal = new THREE.Mesh(
        geometry('portal', () => new THREE.PlaneGeometry(0.47, 0.78)) as THREE.PlaneGeometry,
        surface,
      );
      portal.position.set(0, 0.43, -0.08);
      parent.add(portal);
      portals.push(portal);
      roundBox(parent, 0.58, 0.04, 0.68, 0xe6cc87, 0, 0.03, 0.15);
      for (const z of [0.22, 0.39]) box(parent, 0.26, 0.012, 0.022, 0xa77d36, 0, 0.058, z);
    } else {
      const hinge = new THREE.Group();
      hinge.position.set(-0.245, 0, 0);
      parent.add(hinge);
      for (let plank = 0; plank < 5; plank++)
        box(hinge, 0.084, 0.69, 0.06, plank % 2 ? 0x855b31 : 0x9d743e, 0.045 + plank * 0.098, 0.37);
      for (const y of [0.19, 0.58]) box(hinge, 0.49, 0.07, 0.075, 0x474d40, 0.245, y);
      mesh(
        hinge,
        geometry('lock', () => new THREE.TorusGeometry(0.055, 0.018, 5, 12)),
        material(0xd9ac51, 0.3, 0.65),
        0.38,
        0.38,
        0.06,
      );
      doors.push(hinge);
    }
  }

  roundBox(group, board.width + 0.38, 0.34, board.height + 0.38, palette.earth, 0, -0.25);
  roundBox(group, board.width + 0.18, 0.12, board.height + 0.18, palette.edge, 0, -0.04);
  // Subtle brass corner studs make the board feel like an expedition instrument.
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      mesh(
        group,
        geometry('stud', () => new THREE.SphereGeometry(0.052, 8, 5)),
        material(0xc2a66a, 0.35, 0.45),
        x * (board.width / 2 + 0.015),
        0.055,
        z * (board.height / 2 + 0.015),
      );
    }

  board.terrain.forEach((terrain, cell) => {
    const tile = new THREE.Group();
    tile.position.copy(position(cell));
    group.add(tile);
    const water = terrain === 'water' || terrain === 'bridge';
    const color = terrain === 'ice' ? 0x4eafd0 : water ? 0x2b9395 : palette.floor;
    roundBox(tile, 0.95, 0.09, 0.95, color, 0, 0.045);
    if (water) {
      for (let wave = 0; wave < 2; wave++) {
        const ripple = box(
          tile,
          0.29 + wave * 0.12,
          0.008,
          0.024,
          0x91d7cf,
          (wave - 0.5) * 0.2,
          0.096,
          (wave - 0.5) * 0.42,
        );
        ripple.rotation.y = -0.15;
        waterRipples.push(ripple);
      }
    }
    if (terrain === 'ice') {
      for (let slash = 0; slash < 2; slash++) {
        const crack = box(
          tile,
          0.4,
          0.008,
          0.015,
          0xe5ffff,
          (slash - 0.5) * 0.25,
          0.096,
          (slash - 0.5) * 0.32,
        );
        crack.rotation.y = -0.8;
      }
    }
    if (terrain === 'bridge') {
      for (let plank = 0; plank < 6; plank++)
        box(
          tile,
          0.82,
          0.065,
          0.115,
          plank % 2 ? 0xbd985f : 0xa8814c,
          0,
          0.135,
          (plank - 2.5) * 0.15,
        );
      for (const side of [-1, 1]) {
        box(tile, 0.042, 0.035, 0.92, 0x6c633c, side * 0.32, 0.19);
      }
    }
    if (terrain === 'wall') {
      roundBox(tile, 0.83, 0.26, 0.82, palette.stone, 0, 0.22);
      roundBox(tile, 0.8, 0.2, 0.77, cell % 2 ? palette.stone : palette.edge, 0.02, 0.445);
      roundBox(tile, 0.85, 0.065, 0.82, theme === 'frost' ? 0xe5f4ee : 0xa6ac82, 0, 0.565);
      if (cell % 3 === 0) leaves(tile, -0.2, 0.61, 0.1, cell);
      box(tile, 0.013, 0.2, 0.004, palette.earth, 0.13, 0.45, 0.392);
    } else if (terrain === 'key' || terrain === 'relic') {
      const item = new THREE.Group();
      item.position.copy(position(cell, 0.44));
      group.add(item);
      const brass = material(0xf2c36c, 0.26, 0.6);
      if (terrain === 'key') {
        mesh(
          item,
          geometry('keyRing', () => new THREE.TorusGeometry(0.11, 0.033, 7, 18)),
          brass,
          0,
          0.15,
        );
        mesh(
          item,
          geometry('keyShaft', () => new THREE.BoxGeometry(0.046, 0.25, 0.046)),
          brass,
          0,
          -0.055,
        );
        for (const y of [-0.11, -0.18])
          mesh(
            item,
            geometry('keyTooth', () => new THREE.BoxGeometry(0.09, 0.043, 0.046)),
            brass,
            0.06,
            y,
          );
        item.rotation.z = -0.45;
      } else {
        mesh(
          item,
          geometry('relic', () => new THREE.OctahedronGeometry(0.21)),
          material(0x55d6b6, 0.16, 0.3),
        );
        const rim = mesh(
          item,
          geometry('relicRim', () => new THREE.TorusGeometry(0.16, 0.025, 5, 14)),
          brass,
        );
        rim.rotation.x = Math.PI / 2;
      }
      collectibles.push({ cell, kind: terrain, object: item });
      const marker = mesh(
        tile,
        geometry('itemRing', () => new THREE.RingGeometry(0.18, 0.22, 24)),
        material(0xb39750),
        0,
        0.098,
      );
      marker.rotation.x = -Math.PI / 2;
      marker.castShadow = false;
    } else if (terrain === 'door' || terrain === 'exit') {
      const gateway = new THREE.Group();
      gateway.position.y = 0.095;
      tile.add(gateway);
      arch(gateway, terrain === 'exit');
    } else if (terrain === 'floor' && cell % 5 === 2) {
      // Small engraved seams preserve the grid without introducing fake obstacles.
      box(tile, 0.14, 0.008, 0.013, palette.edge, 0.25, 0.094, 0.33);
    }
  });

  const player = new THREE.Group();
  group.add(player);
  const playerBase = mesh(
    player,
    geometry('playerBase', () => new THREE.CylinderGeometry(0.21, 0.26, 0.045, 24)),
    material(0xd5b165, 0.5, 0.2),
    0,
    0.12,
  );
  playerBase.castShadow = false;
  const atlas = new THREE.TextureLoader().load(
    '/art/expedition-pieces.webp',
    () => {
      if (disposed) atlas.dispose();
      else invalidate();
    },
    undefined,
    () => {
      if (!disposed) invalidate();
    },
  );
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.repeat.set(1 / 3, 1 / 2);
  atlas.offset.set(0, 1 / 2);
  textures.add(atlas);
  const explorerSurface = new THREE.SpriteMaterial({
    map: atlas,
    transparent: true,
    alphaTest: 0.06,
    depthWrite: true,
    toneMapped: false,
  });
  materials.add(explorerSurface);
  const explorer = new THREE.Sprite(explorerSurface);
  explorer.center.set(0.5, 0.13);
  explorer.scale.set(1.18, 1.18, 1);
  explorer.position.set(0, 0.17, 0);
  player.add(explorer);

  const particles = Array.from({ length: 24 }, (_, index) => {
    const surface = new THREE.MeshBasicMaterial({
      color: index % 3 ? 0xf8d88e : 0x9ff2d1,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    materials.add(surface);
    const particle = mesh(
      group,
      geometry('spark', () => new THREE.OctahedronGeometry(0.045)),
      surface,
    );
    particle.visible = false;
    particle.castShadow = false;
    return particle;
  });
  let burst: { at: THREE.Vector3; started: number; duration: number; large: boolean } | null = null;

  function move(
    object: THREE.Object3D,
    destination: THREE.Vector3,
    now: number,
    reduced: boolean,
    hop = 0,
  ) {
    const existing = motions.findIndex((motion) => motion.object === object);
    if (existing !== -1) motions.splice(existing, 1);
    if (reduced || object.position.distanceTo(destination) > Math.max(board.width, board.height)) {
      object.position.copy(destination);
      return;
    }
    const distance = object.position.distanceTo(destination);
    if (distance < 0.001) return;
    motions.push({
      object,
      from: object.position.clone(),
      to: destination,
      started: now,
      duration: Math.min(620, 220 + distance * 65),
      hop,
    });
  }

  function update(state: GameState, won: boolean, now: number, reduced: boolean) {
    const initial = !previous;
    move(
      player,
      position(state.player),
      now,
      reduced || initial,
      board.terrain[state.player] === 'ice' ? 0 : 0.07,
    );
    const nextCells = new Set(state.crates);
    const removed = [...crates.keys()].filter((cell) => !nextCells.has(cell));
    for (const cell of state.crates) {
      if (crates.has(cell)) continue;
      const oldCell = removed.shift();
      const crate = oldCell === undefined ? createCrate() : crates.get(oldCell)!;
      if (oldCell !== undefined) crates.delete(oldCell);
      else {
        group.add(crate);
        crate.position.copy(position(cell, 0.09));
      }
      crates.set(cell, crate);
      move(crate, position(cell, 0.09), now, reduced || initial);
    }
    for (const cell of removed) {
      crates.get(cell)?.removeFromParent();
      crates.delete(cell);
    }
    for (const item of collectibles) {
      const collected =
        item.kind === 'key' ? state.hasKey : isRelicCollected(board, state, item.cell);
      if (item.object.visible && collected && !initial && !reduced)
        burst = { at: position(item.cell, 0.5), started: now, duration: 700, large: false };
      item.object.visible = !collected;
    }
    const doorAngle = state.hasKey ? -Math.PI * 0.44 : 0;
    if (initial || reduced) {
      doors.forEach((door) => {
        door.rotation.y = doorAngle;
      });
      doorMotion = null;
    } else if (state.hasKey !== previous?.hasKey && doors.length) {
      doorMotion = { from: doors[0].rotation.y, to: doorAngle, started: now };
    }
    if (won && !victory && !initial && !reduced)
      burst = { at: position(state.player, 0.6), started: now, duration: 1500, large: true };
    victory = won;
    previous = state;
    activeUntil = reduced ? now : now + (won ? 1600 : 1100);
    if (reduced) {
      burst = null;
      particles.forEach((particle) => {
        particle.visible = false;
      });
    }
  }

  function animate(now: number, reduced: boolean) {
    if (doorMotion) {
      const t = reduced ? 1 : Math.min(1, (now - doorMotion.started) / 460);
      const angle = THREE.MathUtils.lerp(doorMotion.from, doorMotion.to, 1 - Math.pow(1 - t, 3));
      doors.forEach((door) => {
        door.rotation.y = angle;
      });
      if (t === 1) doorMotion = null;
    }
    for (let index = motions.length - 1; index >= 0; index--) {
      const motion = motions[index];
      const t = reduced ? 1 : Math.min(1, (now - motion.started) / motion.duration);
      const eased = t * t * (3 - 2 * t);
      motion.object.position.lerpVectors(motion.from, motion.to, eased);
      motion.object.position.y += Math.sin(t * Math.PI) * motion.hop;
      if (t === 1) motions.splice(index, 1);
    }
    if (!reduced && now < activeUntil) {
      const wave = Math.sin(now * 0.002);
      collectibles.forEach((item, index) => {
        item.object.position.y = 0.45 + Math.sin(now * 0.0025 + index) * 0.035;
        item.object.rotation.y = Math.sin(now * 0.0017 + index) * 0.38;
      });
      waterRipples.forEach((ripple, index) => {
        ripple.scale.x = 1 + Math.sin(now * 0.003 + index) * 0.14;
      });
      portals.forEach((portal) => {
        portal.material.opacity = (victory ? 0.72 : 0.4) + wave * 0.06;
      });
    }
    if (burst) {
      const t = reduced ? 1 : Math.min(1, (now - burst.started) / burst.duration);
      particles.forEach((particle, index) => {
        const angle = index * 2.399963;
        const speed = (burst!.large ? 1.4 : 0.65) * (0.6 + (index % 4) * 0.15);
        particle.visible = t < 1;
        particle.position.set(
          burst!.at.x + Math.cos(angle) * t * speed,
          burst!.at.y + Math.sin(t * Math.PI) * speed + t * 0.3,
          burst!.at.z + Math.sin(angle) * t * speed,
        );
        particle.rotation.set(t * 4 + index, t * 5, 0);
        (particle.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.9;
        particle.scale.setScalar(1 - t * 0.6);
      });
      if (t === 1) burst = null;
    }
    return (
      motions.length > 0 || doorMotion !== null || burst !== null || (!reduced && now < activeUntil)
    );
  }

  function dispose() {
    disposed = true;
    geometries.forEach((value) => value.dispose());
    materials.forEach((value) => value.dispose());
    textures.forEach((value) => value.dispose());
    group.clear();
  }
  return { group, update, animate, dispose };
}
