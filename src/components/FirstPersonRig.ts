import * as THREE from 'three';
import type { BoardDefinition, Direction, GameState } from '../core/types';

export interface MotionCue {
  id: number;
  kind: 'blocked' | 'turn';
}
const headings: Record<Direction, number> = {
  up: 0,
  right: -Math.PI / 2,
  down: Math.PI,
  left: Math.PI / 2,
};

/** A small camera-attached hand rig; state changes, never its animation, decide inventory. */
export function createFirstPersonRig(
  camera: THREE.PerspectiveCamera,
  board: BoardDefinition,
  element: HTMLElement,
) {
  const rig = new THREE.Group();
  camera.add(rig);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const fingers: THREE.Mesh[][] = [];
  const glove = new THREE.MeshStandardMaterial({ color: 0x866142, roughness: 0.8 });
  const seams = new THREE.MeshStandardMaterial({ color: 0x503c2d, roughness: 0.9 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0xb18b41, roughness: 0.9 });
  const brass = new THREE.MeshStandardMaterial({
    color: 0xebbd60,
    metalness: 0.65,
    roughness: 0.3,
  });
  [glove, seams, jacket, brass].forEach((value) => {
    value.depthTest = false;
    value.depthWrite = false;
    value.transparent = true;
    materials.add(value);
  });
  function part(
    parent: THREE.Object3D,
    shape: THREE.BufferGeometry,
    surface: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) {
    geometries.add(shape);
    const object = new THREE.Mesh(shape, surface);
    object.position.set(x, y, z);
    // A conventional overlay view model keeps the camera's own hands out of nearby walls.
    object.renderOrder = 20;
    parent.add(object);
    return object;
  }
  function hand(side: number) {
    const result = new THREE.Group();
    result.scale.setScalar(0.82);
    const digits: THREE.Mesh[] = [];
    fingers.push(digits);
    rig.add(result);
    const sleeve = part(
      result,
      new THREE.CylinderGeometry(0.045, 0.061, 0.24, 10),
      jacket,
      0,
      -0.15,
      0.055,
    );
    sleeve.rotation.x = 0.3;
    part(result, new THREE.CylinderGeometry(0.047, 0.047, 0.025, 12), seams, 0, -0.025, 0.015);
    const palm = part(result, new THREE.SphereGeometry(0.055, 10, 7), glove, 0, 0.026, 0);
    palm.scale.set(0.84, 1.12, 0.55);
    for (let finger = 0; finger < 4; finger++) {
      const digit = part(
        result,
        new THREE.CapsuleGeometry(0.011, 0.041 - Math.abs(1.5 - finger) * 0.004, 3, 7),
        glove,
        (finger - 1.5) * 0.022,
        0.092 - Math.abs(1.5 - finger) * 0.006,
        -0.008,
      );
      digit.rotation.x = -0.35;
      digits.push(digit);
    }
    const thumb = part(
      result,
      new THREE.CapsuleGeometry(0.015, 0.035, 3, 7),
      glove,
      side * -0.047,
      0.035,
      0.015,
    );
    thumb.rotation.z = side * 0.7;
    for (const offset of [-0.025, 0.025])
      part(result, new THREE.BoxGeometry(0.002, 0.044, 0.002), seams, offset, 0.025, 0.031);
    return result;
  }
  const right = hand(1),
    left = hand(-1);
  const heldKey = new THREE.Group();
  right.add(heldKey);
  heldKey.position.set(-0.006, 0.105, -0.026);
  heldKey.rotation.z = -0.24;
  part(heldKey, new THREE.TorusGeometry(0.035, 0.008, 7, 16), brass, 0, 0.07, 0);
  part(heldKey, new THREE.BoxGeometry(0.014, 0.085, 0.014), brass, 0, 0.01, 0);
  for (const y of [-0.023, -0.043])
    part(heldKey, new THREE.BoxGeometry(0.035, 0.012, 0.014), brass, 0.014, y, 0);
  let previous: GameState | undefined;
  let current: GameState | undefined;
  let heading = 0;
  let turn: { from: number; to: number; at: number } | null = null;
  let action: { kind: 'pickup' | 'unlock' | 'push' | 'blocked'; at: number; key: boolean } | null =
    null;
  let movement: { at: number; duration: number; slide: boolean } | null = null;
  let deathAt = 0;
  let cueId: number | undefined;
  let wasWon = false;
  let victoryAt = 0;

  function update(
    state: GameState,
    facing: Direction,
    won: boolean,
    cue: MotionCue | undefined,
    now: number,
    reduced: boolean,
  ) {
    const initial = !previous;
    current = state;
    const target = headings[facing];
    const difference = Math.atan2(Math.sin(target - heading), Math.cos(target - heading));
    if (initial || reduced) {
      heading = target;
      turn = null;
    } else if (
      Math.abs(difference) > 0.001 &&
      (!turn ||
        Math.abs(Math.atan2(Math.sin(target - turn.to), Math.cos(target - turn.to))) > 0.001)
    )
      turn = { from: heading, to: heading + difference, at: now };
    if (!initial && state.player !== previous!.player) {
      const distance =
        Math.abs((state.player % board.width) - (previous!.player % board.width)) +
        Math.abs(
          Math.floor(state.player / board.width) - Math.floor(previous!.player / board.width),
        );
      movement = reduced
        ? null
        : {
            at: now,
            duration: Math.min(620, 220 + distance * 65),
            slide: distance > 1 || board.terrain[state.player] === 'ice',
          };
    }
    if (!initial && !reduced) {
      if (state.hasKey && !previous!.hasKey) action = { kind: 'pickup', at: now, key: true };
      else if (state.doorOpened && !previous!.doorOpened)
        action = { kind: 'unlock', at: now, key: true };
      else if (
        (state.hasBoots && !previous!.hasBoots) ||
        (state.collectedRelics ?? 0) > (previous!.collectedRelics ?? 0)
      )
        action = { kind: 'pickup', at: now, key: false };
      else if (state.crates.some((cell) => !previous!.crates.includes(cell)))
        action = { kind: 'push', at: now, key: false };
      if (cue?.kind === 'blocked' && cue.id !== cueId)
        action = { kind: 'blocked', at: now, key: false };
    }
    if (state.dead && !previous?.dead) deathAt = initial || reduced ? now - 1200 : now;
    if (!state.dead) {
      deathAt = 0;
      element.style.setProperty('--death-opacity', '0');
    }
    if (won && !wasWon) victoryAt = initial || reduced ? now - 1400 : now;
    if (!won) {
      victoryAt = 0;
      element.style.setProperty('--escape-opacity', '0');
    }
    if (initial || reduced || (previous?.dead && !state.dead)) {
      action = null;
      movement = null;
    }
    if (
      previous &&
      ((previous.collectedRelics ?? 0) > (state.collectedRelics ?? 0) ||
        (previous.hasKey && !state.hasKey && !state.doorOpened) ||
        (previous.doorOpened && !state.doorOpened))
    )
      action = null;
    cueId = cue?.id;
    if (!action) heldKey.scale.setScalar(1);
    previous = state;
    wasWon = won;
    element.dataset.deathCause = state.deathCause ?? '';
  }

  function animate(now: number, anchor: THREE.Vector3, reduced: boolean) {
    if (!current) return false;
    if (!action) heldKey.scale.setScalar(1);
    let active = false;
    if (turn) {
      const t = reduced ? 1 : Math.min(1, (now - turn.at) / 250);
      heading = THREE.MathUtils.lerp(turn.from, turn.to, t * t * (3 - 2 * t));
      if (t === 1) turn = null;
      else active = true;
    }
    let bob = 0;
    if (movement) {
      const t = reduced ? 1 : Math.min(1, (now - movement.at) / movement.duration);
      bob = movement.slide ? 0 : Math.sin(t * Math.PI * 2) * 0.009;
      if (t === 1) movement = null;
      else active = true;
    }
    let reach = 0,
      push = 0,
      shake = 0;
    let keyVisible = current.hasKey;
    if (action) {
      const duration = action.kind === 'unlock' ? 760 : action.kind === 'pickup' ? 650 : 340;
      const t = reduced ? 1 : Math.min(1, (now - action.at) / duration);
      const arc = Math.sin(t * Math.PI);
      if (action.kind === 'pickup' || action.kind === 'unlock') reach = arc;
      if (action.kind === 'push') push = arc;
      if (action.kind === 'blocked') shake = Math.sin(t * Math.PI * 4) * (1 - t) * 0.012;
      if (action.kind === 'pickup' && action.key) keyVisible = t > 0.4;
      if (action.kind === 'unlock') {
        keyVisible = t < 0.65;
        heldKey.scale.setScalar(Math.max(0.001, 1 - Math.max(0, t - 0.4) * 2.7));
      }
      if (t === 1) {
        action = null;
        heldKey.scale.setScalar(1);
      } else active = true;
    }
    const death = current.dead
      ? reduced
        ? 1
        : Math.min(1, Math.max(0, now - deathAt - 180) / 950)
      : 0;
    if (current.dead && death < 1) active = true;
    const sink = death * death;
    camera.position.copy(anchor);
    camera.position.y += 0.78 + bob - sink * (current.deathCause === 'water' ? 0.73 : 0.49);
    camera.rotation.set(-0.16 - sink * 0.29, heading, shake + sink * 0.32, 'YXZ');
    right.position.set(
      0.24 - reach * 0.115,
      (keyVisible ? -0.18 : -0.215) + bob + reach * 0.14 + push * 0.09 - death * 0.22,
      -0.38 - reach * 0.18 - push * 0.08,
    );
    right.rotation.set(-0.55 + reach * 0.15, -0.3, -0.38 + reach * 0.3);
    left.position.set(
      -0.255 + push * 0.025,
      -0.235 - bob + push * 0.12 - death * 0.22,
      -0.39 - push * 0.09,
    );
    left.rotation.set(-0.65 + push * 0.25, 0.35, 0.4);
    fingers[0].forEach((finger) => {
      finger.rotation.x = keyVisible ? -1.05 : -0.48;
    });
    fingers[1].forEach((finger) => {
      finger.rotation.x = -0.6 + push * 0.2;
    });
    heldKey.visible = keyVisible && !current.dead;
    element.style.setProperty('--death-opacity', (death * 0.75).toFixed(3));
    const escaped = wasWon
      ? reduced
        ? 0.32
        : Math.min(0.32, Math.max(0, now - victoryAt) / 4000)
      : 0;
    element.style.setProperty('--escape-opacity', escaped.toFixed(3));
    if (wasWon && !reduced && now - victoryAt < 1400) active = true;
    return active;
  }
  function dispose() {
    rig.removeFromParent();
    element.style.removeProperty('--death-opacity');
    element.style.removeProperty('--escape-opacity');
    geometries.forEach((value) => value.dispose());
    materials.forEach((value) => value.dispose());
  }
  return { rig, update, animate, dispose };
}
