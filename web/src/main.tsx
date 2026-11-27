/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';
import { createRobot } from './robot';
import { ClimbingWall } from './ClimbingWall';

type Viewer = { view: (side: boolean) => void; replay: () => void; grip: (underhand: boolean) => void };

function App() {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const playing = useRef(!matchMedia('(prefers-reduced-motion: reduce)').matches);
  const grip = useRef(false);
  const [underhand, setUnderhand] = useState(false);
  const [paused, setPaused] = useState(!playing.current);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    const container = host.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e7efec');
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 30);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setStatus('failed');
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.append(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D pull-up demonstration');
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 3.5;
    controls.maxDistance = 8;
    const view = (side: boolean) => {
      controls.target.set(0, 1.10, 0);
      camera.position.set(side ? 4.4 : 0, 1.27, side ? 0 : 4.4);
      controls.update();
    };
    view(false);
    scene.add(new THREE.HemisphereLight('#ffffff', '#658174', 2.4));
    const key = new THREE.DirectionalLight('#fff6de', 2.1);
    key.position.set(3, 5, 4);
    scene.add(key);
    const resize = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: height } = container;
      if (!width || !height) return;
      renderer.setSize(width, height);
      // Keep the whole figure in frame on a narrow screen.
      camera.aspect = width / height;
      camera.fov = camera.aspect < 0.8 ? 44 : 35;
      camera.updateProjectionMatrix();
    });
    resize.observe(container);

    let disposed = false;
    let mixer: THREE.AnimationMixer | undefined;
    let updateRobot: ((underhand: boolean) => void) | undefined;
    let previous = performance.now();
    const fail = () => { if (!disposed) setStatus('failed'); };
    renderer.domElement.addEventListener('webglcontextlost', fail);
    new GLTFLoader().load(import.meta.env.BASE_URL + 'pull-up.glb', ({ scene: model, animations, userData }) => {
      if (disposed) return;
      const { barY, barZ } = userData;
      const clip = animations[0];
      if (animations.length !== 2 || !clip || !Number.isFinite(barY) || !Number.isFinite(barZ)) { fail(); return; }
      model.traverse(object => { if (object instanceof THREE.Mesh) object.visible = false; });
      scene.add(model);
      updateRobot = createRobot(model, scene);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.6, 24),
        new THREE.MeshStandardMaterial({ color: '#284c42', metalness: 0.25 }));
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, barY, barZ);
      scene.add(bar);
      mixer = new THREE.AnimationMixer(model);
      let action = mixer.clipAction(clip).play();
      mixer.update(0);
      viewer.current = {
        view,
        replay: () => { action.reset().play(); mixer?.update(0); },
        grip: (value) => {
          if (!mixer) return;
          action.stop();
          action = mixer.clipAction(animations[value ? 1 : 0]).reset().play();
          mixer.update(0);
        },
      };
      setStatus('ready');
    }, undefined, fail);
    renderer.setAnimationLoop(now => {
      if (playing.current) mixer?.update(Math.min((now - previous) / 1000, 0.05));
      updateRobot?.(grip.current);
      previous = now;
      renderer.render(scene, camera);
    });
    return () => {
      disposed = true;
      viewer.current = null;
      resize.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        for (const material of [object.material].flat()) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
          material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  function toggle() {
    playing.current = !playing.current;
    setPaused(!playing.current);
  }

  function selectGrip(value: boolean) {
    grip.current = value;
    setUnderhand(value);
    viewer.current?.grip(value);
  }

  return <main>
    <header><p className="brand">Climbing Strength Library</p><h1>{underhand ? "Chin-up" : "Pull-up"}</h1>
      <p>Hang from the bar. Draw your elbows down to lift your chest toward the bar, then lower back to a full hang.</p></header>
    <section aria-label="Exercise demonstration">
      {status === 'ready' && <div className="controls" role="group" aria-label="Grip">
        <button aria-pressed={!underhand} onClick={() => selectGrip(false)}>Overhand</button>
        <button aria-pressed={underhand} onClick={() => selectGrip(true)}>Underhand</button>
      </div>}
      <div className="stage" ref={host} data-status={status}>
        {status !== 'ready' && <img src={import.meta.env.BASE_URL + 'pull-up.png'} alt="Mannequin hanging from a pull-up bar" />}
      </div>
      {status === 'loading' && <p role="status">Loading 3D demonstration…</p>}
      {status === 'failed' && <p role="status">The 3D viewer is unavailable. The still above shows the starting position.</p>}
      {status === 'ready' && <div className="controls">
        <button onClick={toggle}>{paused ? 'Play' : 'Pause'}</button>
        <button onClick={() => { viewer.current?.replay(); playing.current = true; setPaused(false); }}>Replay</button>
        <button onClick={() => viewer.current?.view(false)}>Front</button>
        <button onClick={() => viewer.current?.view(true)}>Side</button>
      </div>}
    </section>
  </main>;
}

function Library() {
  const [wall, setWall] = useState(false);
  return <>
    <nav className="exercise-nav controls" aria-label="Exercise collection">
      <button aria-pressed={!wall} onClick={() => setWall(false)}>Bar exercises</button>
      <button aria-pressed={wall} onClick={() => setWall(true)}>Climbing walls</button>
    </nav>
    {wall ? <ClimbingWall /> : <App />}
  </>;
}

createRoot(document.getElementById('root')!).render(<Library />);
