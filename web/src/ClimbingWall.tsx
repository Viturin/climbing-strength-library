import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRobot } from './robot';
import { createWallMotion, holdCenterZ, holdDepth, wallAngles, wallDuration, wallSurface } from './wall-motion';

type Controls = { rewind: () => void; view: (side: boolean) => void };

export function ClimbingWall() {
  const [index, setIndex] = useState(1);
  const [available, setAvailable] = useState(true);
  const playing = useRef(!matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [paused, setPaused] = useState(!playing.current);
  const finished = useRef(false);
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<Controls | null>(null);
  const wall = wallAngles[index];

  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setAvailable(false);
      return;
    }
    setAvailable(true);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.domElement.setAttribute('aria-label', `${wall.name} climbing wall demonstration`);
    container.append(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e7efec');
    const wallGroup = new THREE.Group();
    wallGroup.rotation.x = THREE.MathUtils.degToRad(-wall.angle);
    scene.add(wallGroup);
    const { rig, pose, holds } = createWallMotion(index);
    const updateRobot = createRobot(rig, wallGroup, index === 0 ? 'flat' : true);
    const panelMaterial = new THREE.MeshStandardMaterial({ color: '#b5c7c2', roughness: 0.92 });
    const seamMaterial = new THREE.MeshStandardMaterial({ color: '#9eb1ab' });
    for (let row = 0; row < 5; row++) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.49, 0.065), panelMaterial);
      panel.position.set(0, row * 0.50 + 0.25, wallSurface + 0.0325);
      wallGroup.add(panel);
    }
    const boltGeometry = new THREE.CircleGeometry(0.009, 10);
    for (let x = -0.9; x <= 0.91; x += 0.18) {
      for (let y = 0.14; y < 2.48; y += 0.24) {
        const bolt = new THREE.Mesh(boltGeometry, seamMaterial);
        bolt.rotateY(Math.PI);
        bolt.position.set(x, y, 0.028);
        wallGroup.add(bolt);
      }
    }
    const handMaterial = new THREE.MeshStandardMaterial({ color: '#a95338' });
    const footMaterial = new THREE.MeshStandardMaterial({ color: '#367a70' });
    for (const [limb, [x, y]] of holds) {
      const hand = limb.endsWith('Hand');
      const hold = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), hand ? handMaterial : footMaterial);
      hold.scale.set(hand ? 0.105 : 0.075, hand ? 0.04 : 0.027, holdDepth)
        .multiplyScalar(wall.holdScale);
      hold.position.set(x, y, holdCenterZ);
      wallGroup.add(hold);
    }

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 3.5;
    controls.maxDistance = 8;
    function view(side: boolean) {
      const center = new THREE.Vector3(0, 1.25, -0.18).applyQuaternion(wallGroup.quaternion);
      const offset = side
        ? new THREE.Vector3(4.8, 0.1, -0.9)
        : new THREE.Vector3(1.1, 0.25, -4.6).applyQuaternion(wallGroup.quaternion);
      controls.target.copy(center);
      camera.position.copy(center).add(offset);
      controls.update();
    }
    view(false);
    scene.add(new THREE.HemisphereLight('#f5ffff', '#728e84', 2.6));
    const key = new THREE.DirectionalLight('#fff3de', 2.2);
    key.position.set(-3, 3, -4);
    scene.add(key);
    const grid = new THREE.GridHelper(8, 16, '#9fb5ad', '#d8e2df');
    grid.position.y = -0.95;
    scene.add(grid);
    const resize = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: height } = container;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.fov = camera.aspect < 0.85 ? 48 : 38;
      camera.updateProjectionMatrix();
    });
    resize.observe(container);
    finished.current = false;
    let elapsed = 0;
    let previous = performance.now();
    api.current = { view, rewind: () => { elapsed = 0; } };
    const fail = () => { setAvailable(false); };
    renderer.domElement.addEventListener('webglcontextlost', fail);
    renderer.setAnimationLoop(now => {
      if (playing.current) {
        elapsed += Math.min((now - previous) / 1000, 0.05);
        if (index === 3 && elapsed >= 3.4) {
          elapsed = 3.4;
          finished.current = true;
          playing.current = false;
          setPaused(true);
        } else {
          elapsed %= wallDuration;
        }
      }
      previous = now;
      pose(elapsed);
      updateRobot(false);
      renderer.render(scene, camera);
    });
    return () => {
      api.current = null;
      renderer.domElement.removeEventListener('webglcontextlost', fail);
      renderer.setAnimationLoop(null);
      resize.disconnect();
      controls.dispose();
      scene.traverse(node => {
        if (!(node instanceof THREE.Mesh || node instanceof THREE.LineSegments)) return;
        node.geometry.dispose();
        for (const material of [node.material].flat()) material.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [index, wall]);

  function play(value: boolean) {
    if (value && finished.current) {
      api.current?.rewind();
      finished.current = false;
    }
    playing.current = value;
    setPaused(!value);
  }

  return <main>
    <header>
      <p className="brand">{wall.kind} · {wall.name}</p>
      <h1>{wall.move}</h1>
      <p>{wall.cue}</p>
    </header>
    <section aria-label="Climbing wall demonstration">
      <div className="controls" role="group" aria-label="Wall angle">
        {wallAngles.map((angle, number) => <button key={angle.name}
          aria-pressed={index === number} onClick={() => setIndex(number)}>{angle.name}</button>)}
      </div>
      <div className="stage" ref={host}>
        {!available && <p className="stage-message" role="status">The 3D wall preview is unavailable in this browser.</p>}
      </div>
      {available && <div className="controls">
        <button onClick={() => play(paused)}>{paused ? 'Play' : 'Pause'}</button>
        <button onClick={() => { api.current?.rewind(); play(true); }}>Replay</button>
        <button onClick={() => api.current?.view(false)}>Wall view</button>
        <button onClick={() => api.current?.view(true)}>Side</button>
      </div>}
      <p className="wall-key">{index === 0 ? "Teal marks the footholds. The palms press against the wall without handholds." : "Orange holds are for hands. Teal holds are for feet."}</p>
    </section>
  </main>;
}
