import * as THREE from 'three';

export const wallAngles = [
  { name: 'Slab', angle: -15, kind: 'Balance', move: 'Hands-flat slab traverse',
    cue: 'Press open palms against the wall. Move sideways on the small footholds and shift over the standing shoe before each step.', holdScale: 0.64 },
  { name: 'Vertical', angle: 0, kind: 'Warm-up', move: 'Quiet feet with hip turns',
    cue: 'Turn toward the standing foot to unweight the other shoe. Place that toe quietly before transferring weight.', holdScale: 1 },
  { name: 'Overhang', angle: 25, kind: 'Strength', move: 'Alternating heel hooks',
    cue: 'Set the rubber heel on the side hold. Pull gently through the heel, then return to the lower foothold and switch sides.', holdScale: 1.05 },
  { name: 'Heavy overhang', angle: 55, kind: 'Power', move: 'Two-hand dyno',
    cue: 'Load both feet, drive upward, and catch the higher jugs with both hands. Bring the feet back onto the wall after the catch.', holdScale: 1.35 },
  { name: 'Roof', angle: 90, kind: 'Strength', move: 'Roof jug tuck hold',
    cue: 'Hold the big jugs and keep both toes on the footholds while drawing your knees in.', holdScale: 1.55 },
] as const;

export const wallSurface = 0.0295;
export const holdCenterZ = 0.012;
export const holdDepth = 0.056;

type Limb = 'leftHand' | 'rightHand' | 'leftFoot' | 'rightFoot';
type Contact = [number, number];
type Step = [Limb, Contact];

const base: Record<Limb, Contact> = {
  leftHand: [0.28, 1.69], rightHand: [-0.30, 1.61],
  leftFoot: [0.19, 0.37], rightFoot: [-0.19, 0.40],
};
const starts: Partial<Record<Limb, Contact>>[] = [
  { leftHand: [0.79, 1.47], rightHand: [-0.79, 1.44], leftFoot: [0.02, 0.43], rightFoot: [-0.23, 0.39] },
  { leftHand: [0.19, 2.14], rightHand: [-0.22, 2.06], leftFoot: [0.13, 0.42], rightFoot: [-0.16, 0.37] },
  { leftHand: [0.21, 2.02], rightHand: [-0.20, 1.96], leftFoot: [0.12, 0.28], rightFoot: [-0.13, 0.25] },
  { leftHand: [0.20, 1.91], rightHand: [-0.19, 1.84], leftFoot: [0.14, 0.29], rightFoot: [-0.17, 0.33] },
  { leftHand: [0.19, 1.99], rightHand: [-0.19, 1.92], leftFoot: [0.14, 0.34], rightFoot: [-0.15, 0.24] },
];
const sequences: Step[][] = [
  [['leftFoot', [0.28, 0.48]], ['rightFoot', [0.08, 0.42]]],
  [['rightFoot', [-0.21, 0.54]], ['leftFoot', [0.19, 0.56]]],
  [['leftFoot', [0.29, 0.81]], ['rightFoot', [-0.29, 0.81]]],
  [['leftHand', [0.21, 2.33]], ['rightHand', [-0.21, 2.30]], ['leftFoot', [0.15, 0.53]], ['rightFoot', [-0.15, 0.56]]],
  [],
];
export const wallDuration = 8;

function smooth(t: number) { return t * t * (3 - 2 * t); }

export function createWallMotion(index: number) {
  const sequence = sequences[index];
  const start = { ...base, ...starts[index] };
  const rig = new THREE.Group();
  function joint(name: string) {
    const node = new THREE.Object3D();
    node.name = name;
    rig.add(node);
    return node.position;
  }
  const hips = joint('pelvis');
  const spine2 = joint('spine_02');
  const spine3 = joint('spine_03');
  const neck = joint('neck_01');
  const head = joint('Head');
  const sides = ['l', 'r'].map((side, i) => ({
    sign: i === 0 ? 1 : -1,
    hand: i === 0 ? 'leftHand' as const : 'rightHand' as const,
    foot: i === 0 ? 'leftFoot' as const : 'rightFoot' as const,
    shoulder: joint(`upperarm_${side}`), elbow: joint(`lowerarm_${side}`), wrist: joint(`hand_${side}`),
    hip: joint(`thigh_${side}`), knee: joint(`calf_${side}`), ankle: joint(`foot_${side}`),
    shoe: rig.getObjectByName(`foot_${side}`)!,
  }));

  // Choose the joint position on the circle where the two fixed-length links meet.
  function solve(origin: THREE.Vector3, target: THREE.Vector3, out: THREE.Vector3,
    first: number, second: number, pole: THREE.Vector3) {
    const direction = target.clone().sub(origin);
    const distance = direction.length();
    if (distance >= first + second || distance <= Math.abs(first - second)) {
      throw new Error(`Wall ${index}: target outside limb reach (${distance.toFixed(3)})`);
    }
    direction.divideScalar(distance);
    const along = (first ** 2 - second ** 2 + distance ** 2) / (2 * distance);
    pole.addScaledVector(direction, -pole.dot(direction)).normalize();
    out.copy(origin).addScaledVector(direction, along).addScaledVector(pole, Math.sqrt(first ** 2 - along ** 2));
  }

  function pose(seconds: number) {
    const t = seconds % wallDuration;
    const progress = index === 3 ? Math.min(t, 4) : t <= 4 ? t : wallDuration - t;
    const contacts = Object.fromEntries(Object.entries(start).map(([key, value]) => [
      key, new THREE.Vector3(...value, 0),
    ])) as Record<Limb, THREE.Vector3>;
    const phase = (start: number, duration: number) => Math.min(1, Math.max(0, (progress - start) / duration));
    const move = (limb: Limb, target: Contact, amount: number, lift: number) => {
      contacts[limb].lerp(new THREE.Vector3(...target, 0), smooth(amount));
      contacts[limb].z = -lift * Math.sin(Math.PI * amount);
    };
    let x = 0;
    let rise = 0;
    let depth = [-0.27, -0.465, -0.45, -0.45, -0.59][index];
    let turn = 0;
    const hooks: Record<Limb, number> = { leftHand: 0, rightHand: 0, leftFoot: 0, rightFoot: 0 };

    if (index === 0) {
      const step = phase(0.42, 0.73);
      const follow = phase(2.22, 0.68);
      move('leftFoot', sequence[0][1], step, 0.10);
      move('rightFoot', sequence[1][1], follow, 0.09);
      x = -0.07 - 0.105 * smooth(phase(0, 0.39)) + 0.32 * smooth(phase(1.15, 1.04));
      rise = 0.035 * smooth(phase(1.15, 1.04));
      turn = 0.16 * (smooth(follow) - smooth(step));
      for (const limb of ['leftHand', 'rightHand'] as const) {
        contacts[limb].x += x;
      }
    } else if (index === 1) {
      const weight = smooth(phase(0, 0.58)) - 2 * smooth(phase(1.46, 0.72));
      x = 0.12 * weight;
      turn = -0.42 * weight;
      move('rightFoot', sequence[0][1], phase(0.63, 0.72), 0.13);
      move('leftFoot', sequence[1][1], phase(2.22, 0.75), 0.13);
      rise = 0.045 * smooth(phase(2.95, 0.72));
    } else if (index === 2) {
      const leftUp = phase(0.25, 0.65);
      const leftDown = phase(1.43, 0.56);
      const rightUp = phase(2.12, 0.65);
      hooks.leftFoot = smooth(leftUp) - smooth(leftDown);
      hooks.rightFoot = smooth(rightUp);
      move('leftFoot', sequence[0][1], hooks.leftFoot, 0.15);
      move('rightFoot', sequence[1][1], hooks.rightFoot, 0.15);
      x = -0.07 * (hooks.leftFoot - hooks.rightFoot);
      turn = -0.19 * (hooks.leftFoot - hooks.rightFoot);
      depth += 0.045 * (hooks.leftFoot + hooks.rightFoot);
    } else if (index === 3) {
      const load = smooth(phase(0.25, 0.65)) * (1 - smooth(phase(0.90, 0.27)));
      const flight = phase(1.0, 0.35);
      const land = phase(1.48, 0.73);
      rise = -0.12 * load + 0.34 * smooth(flight) + 0.041 * Math.sin(Math.PI * flight);
      depth -= 0.06 * Math.sin(Math.PI * flight);
      move('leftHand', sequence[0][1], flight, 0.12);
      move('rightHand', sequence[1][1], flight, 0.12);
      for (let n = 2; n < sequence.length; n++) {
        const [limb, target] = sequence[n];
        move(limb, target, land, 0.13);
        contacts[limb].y += 0.26 * smooth(flight) * (1 - smooth(land));
        contacts[limb].z -= 0.21 * smooth(flight) * (1 - smooth(land));
      }
    } else {
      const engage = smooth(phase(0.95, 1.85));
      rise = -0.10 * engage;
      depth += 0.105 * engage;
      turn = -0.18 * engage;
      x = -0.055 * engage;
    }

    hips.set(x, [1.165, 1.13, 1.03, 1.01, 0.98][index] + rise, depth);
    const shoulderShift = index === 0 ? -0.04 * (x + 0.07) : 0;
    spine2.copy(hips).add(new THREE.Vector3(shoulderShift, 0.24, 0.025));
    spine3.copy(hips).add(new THREE.Vector3(shoulderShift, 0.39, 0.05));
    neck.copy(spine3).add(new THREE.Vector3(0, 0.13, 0.025));
    head.copy(neck).add(new THREE.Vector3(0, 0.06, 0));
    const holdFront = holdCenterZ - holdDepth * wallAngles[index].holdScale;
    for (const side of sides) {
      side.shoulder.copy(spine3).add(new THREE.Vector3(side.sign * 0.16 * Math.cos(turn), 0.015, -side.sign * 0.16 * Math.sin(turn)));
      side.hip.copy(hips).add(new THREE.Vector3(side.sign * 0.095 * Math.cos(turn), 0, -side.sign * 0.095 * Math.sin(turn)));
      side.wrist.copy(contacts[side.hand]).add(new THREE.Vector3(0, -0.07, index === 0 ? 0.015 : holdFront - 0.022));
      const hook = hooks[side.foot];
      side.shoe.rotation.y = side.sign * Math.PI * hook;
      side.ankle.copy(contacts[side.foot]).add(new THREE.Vector3(0, 0.029, holdFront - 0.126 + 0.078 * hook));
      solve(side.shoulder, side.wrist, side.elbow, 0.37, 0.37, new THREE.Vector3(side.sign * 0.02, -0.50, -1.3));
      solve(side.hip, side.ankle, side.knee, 0.43, 0.43, new THREE.Vector3(side.sign * (index === 1 ? 0.025 : 0.19), 0.35, index === 1 ? 0.18 : index === 0 ? 0.07 : 0.15));
    }
  }

  return { rig, pose, holds: [...Object.entries(start), ...sequence].filter(([limb]) => index !== 0 || limb.endsWith('Foot')) as [Limb, Contact][] };
}
