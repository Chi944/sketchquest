import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { initialState } from '../core/rules';
import type { BoardDefinition, GameState } from '../core/types';
import { createBoardWorld, type SceneTheme } from './BoardSceneWorld';
import styles from './BoardScene.module.css';

export interface BoardSceneProps {
  board: BoardDefinition;
  state?: GameState;
  won?: boolean;
  theme?: SceneTheme;
  onUnavailable?: () => void;
}

/** Lazy-loaded visual companion to the accessible HTML board and movement controls. */
export function BoardScene({
  board,
  state,
  won = false,
  theme = 'forest',
  onUnavailable,
}: BoardSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const update = useRef<((state: GameState, won: boolean) => void) | null>(null);
  const latest = useRef({ state, won, onUnavailable });
  latest.current = { state, won, onUnavailable };

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
        failIfMajorPerformanceCaveat: true,
      });
    } catch {
      latest.current.onUnavailable?.();
      return;
    }
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.boardScene = 'true';
    element.appendChild(canvas);
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 80);
    // A shallow horizontal angle keeps the four movement directions easy to read.
    camera.position.set(4.2, 11, 10.5);
    camera.lookAt(0, 0.12, 0);
    const hemisphere = new THREE.HemisphereLight(0xf4f6e2, 0x365b54, 2.6);
    scene.add(hemisphere);
    const sunlight = new THREE.DirectionalLight(0xffe7b5, 3.2);
    sunlight.position.set(-4, 10, 5);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(1024, 1024);
    sunlight.shadow.camera.left = -7;
    sunlight.shadow.camera.right = 7;
    sunlight.shadow.camera.top = 7;
    sunlight.shadow.camera.bottom = -7;
    sunlight.shadow.camera.near = 0.5;
    sunlight.shadow.camera.far = 30;
    sunlight.shadow.normalBias = 0.035;
    sunlight.shadow.bias = -0.00015;
    scene.add(sunlight);
    const fill = new THREE.DirectionalLight(theme === 'frost' ? 0xa8dbff : 0xb3dfd4, 0.8);
    fill.position.set(4, 3, -5);
    scene.add(fill);

    const shadowGeometry = new THREE.PlaneGeometry(board.width + 4, board.height + 4);
    const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.28 });
    const ground = new THREE.Mesh(shadowGeometry, shadowMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.47;
    ground.receiveShadow = true;
    scene.add(ground);

    let disposed = false;
    let visible = true;
    let frame = 0;
    let previousFrame = 0;
    let tiltUntil = 0;
    const desiredTilt = new THREE.Vector2();
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = media.matches;

    function requestFrame() {
      if (!disposed && !frame && visible && !document.hidden) frame = requestAnimationFrame(render);
    }
    const world = createBoardWorld(board, theme, requestFrame);
    scene.add(world.group);

    function render(now: number) {
      frame = 0;
      if (disposed || !visible || document.hidden) return;
      // Animation is capped near 30fps; static scenes consume no render loop.
      if (!reduced && now - previousFrame < 28) {
        requestFrame();
        return;
      }
      previousFrame = now;
      const moving = world.animate(now, reduced);
      if (!reduced && now < tiltUntil) {
        world.group.rotation.y += (desiredTilt.x - world.group.rotation.y) * 0.16;
        world.group.rotation.x += (desiredTilt.y - world.group.rotation.x) * 0.16;
      }
      renderer.render(scene, camera);
      if (moving || (!reduced && now < tiltUntil)) requestFrame();
    }
    function fit() {
      const width = element!.clientWidth;
      const height = element!.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      const aspect = width / height;
      camera.updateMatrixWorld();
      const bounds = new THREE.Box2();
      for (const x of [-board.width / 2 - 0.4, board.width / 2 + 0.4]) {
        for (const y of [-0.5, 1.5]) {
          for (const z of [-board.height / 2 - 0.4, board.height / 2 + 0.4]) {
            const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
            bounds.expandByPoint(new THREE.Vector2(point.x, point.y));
          }
        }
      }
      const center = bounds.getCenter(new THREE.Vector2());
      const size = bounds.getSize(new THREE.Vector2());
      const halfHeight = Math.max(size.y / 2, size.x / (aspect * 2)) * 1.045;
      camera.left = center.x - halfHeight * aspect;
      camera.right = center.x + halfHeight * aspect;
      camera.top = center.y + halfHeight;
      camera.bottom = center.y - halfHeight;
      camera.updateProjectionMatrix();
      requestFrame();
    }
    function onPointerMove(event: PointerEvent) {
      if (reduced || event.pointerType !== 'mouse') return;
      const rect = element!.getBoundingClientRect();
      desiredTilt.set(
        ((event.clientX - rect.left - rect.width / 2) / rect.width) * 0.055,
        ((event.clientY - rect.top - rect.height / 2) / rect.height) * 0.022,
      );
      tiltUntil = performance.now() + 550;
      requestFrame();
    }
    function onPointerLeave() {
      desiredTilt.set(0, 0);
      tiltUntil = performance.now() + 550;
      requestFrame();
    }
    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else requestFrame();
    }
    function onMotionPreference() {
      reduced = media.matches;
      if (reduced) {
        world.group.rotation.set(0, 0, 0);
        world.update(
          latest.current.state ?? initialState(board),
          latest.current.won,
          performance.now(),
          true,
        );
      }
      requestFrame();
    }
    function onContextLost(event: Event) {
      event.preventDefault();
      cancelAnimationFrame(frame);
      frame = 0;
      latest.current.onUnavailable?.();
    }
    const resize = new ResizeObserver(fit);
    resize.observe(element);
    const intersection = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) requestFrame();
        else {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      },
      { rootMargin: '40px' },
    );
    intersection.observe(element);
    document.addEventListener('visibilitychange', onVisibility);
    media.addEventListener('change', onMotionPreference);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('webglcontextlost', onContextLost);
    update.current = (next, completed) => {
      world.update(next, completed, performance.now(), reduced);
      requestFrame();
    };
    update.current(latest.current.state ?? initialState(board), latest.current.won);
    fit();

    return () => {
      disposed = true;
      update.current = null;
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      media.removeEventListener('change', onMotionPreference);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      world.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();
      sunlight.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [board, theme]);

  useEffect(() => {
    update.current?.(state ?? initialState(board), won);
  }, [board, state, won]);

  return (
    <div
      ref={host}
      className={`${styles.scene} ${styles[theme]}`}
      aria-hidden="true"
      data-scene-theme={theme}
    />
  );
}

export default BoardScene;
