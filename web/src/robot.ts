import * as THREE from 'three';

export function createRobot(rig: THREE.Object3D, scene: THREE.Scene) {
  const robot = new THREE.Group();
  scene.add(robot);
  const shell = new THREE.MeshStandardMaterial({ color: '#dce1d9', roughness: 0.36, metalness: 0.3 });
  const joint = new THREE.MeshStandardMaterial({ color: '#253b35', roughness: 0.52 });
  const accent = new THREE.MeshStandardMaterial({ color: '#e27e38', roughness: 0.45 });
  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const bar = new THREE.CylinderGeometry(1, 1, 1, 12);
  const updates: (() => void)[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();

  function bone(name: string) {
    const node = rig.getObjectByName(name);
    if (!node) throw new Error(`Missing mannequin bone: ${name}`);
    return node;
  }

  function ball(name: string, radii: [number, number, number], material = joint, y = 0, z = 0) {
    const node = bone(name);
    const mesh = new THREE.Mesh(sphere, material);
    mesh.scale.set(...radii);
    robot.add(mesh);
    updates.push(() => {
      node.getWorldPosition(mesh.position);
      mesh.position.y += y;
      mesh.position.z += z;
    });
  }

  function link(start: string, end: string, width: number, depth = width, material = shell) {
    const a = bone(start);
    const b = bone(end);
    const mesh = new THREE.Mesh(bar, material);
    robot.add(mesh);
    updates.push(() => {
      a.getWorldPosition(from);
      b.getWorldPosition(to);
      mesh.position.copy(from).lerp(to, 0.5);
      to.sub(from);
      mesh.scale.set(width, to.length() * 0.78, depth);
      mesh.quaternion.setFromUnitVectors(up, to.normalize());
    });
  }

  link('pelvis', 'spine_03', 0.084, 0.07, joint);
  ball('pelvis', [0.133, 0.075, 0.091], shell);
  link('spine_02', 'neck_01', 0.158, 0.089);
  ball('Head', [0.081, 0.095, 0.078], shell, 0.073);
  ball('Head', [0.063, 0.026, 0.039], joint, 0.081, 0.057);
  ball('Head', [0.044, 0.011, 0.023], accent, 0.081, 0.079);

  for (const side of ['l', 'r']) {
    const name = (part: string) => `${part}_${side}`;
    link('neck_01', name('upperarm'), 0.035, 0.035, joint);
    link(name('upperarm'), name('lowerarm'), 0.047);
    link(name('lowerarm'), name('hand'), 0.038);
    link(name('thigh'), name('calf'), 0.055);
    link(name('calf'), name('foot'), 0.042);
    ball(name('upperarm'), [0.054, 0.054, 0.054], accent);
    ball(name('lowerarm'), [0.04, 0.04, 0.04]);
    ball(name('thigh'), [0.05, 0.05, 0.05]);
    ball(name('calf'), [0.043, 0.043, 0.043], accent);
    ball(name('foot'), [0.043, 0.033, 0.074], joint, -0.027, 0.04);
    ball(name('hand'), [0.035, 0.049, 0.033], joint, 0.029);
    ball(name('hand'), [0.037, 0.031, 0.032], accent, 0.069);
  }

  return () => updates.forEach(update => update());
}
