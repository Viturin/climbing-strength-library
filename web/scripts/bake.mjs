import { readFileSync, writeFileSync } from 'node:fs';
import { Object3D, Quaternion, Vector3 } from 'three';

const source = readFileSync(new URL('../../animation/quaternius-base.glb', import.meta.url));
const jsonEnd = 20 + source.readUInt32LE(12);
const asset = JSON.parse(source.toString('utf8', 20, jsonEnd));
const binary = [source.subarray(jsonEnd + 8)];
let offset = binary[0].length;
const bones = asset.nodes.map(node => {
  const bone = new Object3D();
  if (node.translation) bone.position.fromArray(node.translation);
  if (node.rotation) bone.quaternion.fromArray(node.rotation);
  if (node.scale) bone.scale.fromArray(node.scale);
  return bone;
});
asset.nodes.forEach((node, id) => node.children?.forEach(child => bones[id].add(bones[child])));
const id = name => asset.nodes.findIndex(node => node.name === name);
const bone = name => bones[id(name)];
const world = node => node.getWorldPosition(new Vector3());
// Rotate a limb while preserving the rest-pose twist as much as possible.
function aim(parent, child, target) {
  const origin = world(parent);
  const rotation = new Quaternion().setFromUnitVectors(
    world(child).sub(origin).normalize(), target.clone().sub(origin).normalize(),
  ).multiply(parent.getWorldQuaternion(new Quaternion()));
  parent.quaternion.copy(parent.parent.getWorldQuaternion(new Quaternion()).invert().multiply(rotation));
}
const root = bone('Armature');
const arms = ['l', 'r'].map(side => {
  const upper = bone(`upperarm_${side}`);
  const lower = bone(`lowerarm_${side}`);
  const hand = bone(`hand_${side}`);
  const shoulder = world(upper);
  return { upper, lower, hand, clavicle: bone(`clavicle_${side}`),
    clavicleRest: bone(`clavicle_${side}`).position.clone(),
    a: world(lower).distanceTo(shoulder), b: world(hand).distanceTo(world(lower)) };
});
const shoulder = world(arms[0].upper);
const wristY = shoulder.y + arms[0].a + arms[0].b - 0.012;
const barZ = shoulder.z + 0.035;
const barY = wristY + 0.07;
// Conservative side-view envelope for the robot head, visor, and bar radius.
const headClearance = 0.13;
const up = new Vector3(0, 1, 0);
const rest = bones.map(node => node.quaternion.clone());
const times = Array.from({ length: 97 }, (_, frame) => frame / 30);
const lateral = new Vector3(1, 0, 0);

function ease(progress) {
  const t = Math.min(1, Math.max(0, progress));
  return t*t*(3 - 2*t);
}

function pitch(node, radians) {
  const parent = node.parent.getWorldQuaternion(new Quaternion());
  const axis = lateral.clone().applyQuaternion(parent.invert());
  node.quaternion.premultiply(new Quaternion().setFromAxisAngle(axis, radians));
}

function bakeGrip(underhand) {
  const tracks = new Map();
  function record(node, path) {
    const key = bones.indexOf(node) + ':' + path;
    if (!tracks.has(key)) tracks.set(key, []);
    const values = tracks.get(key);
    const value = node[path === 'rotation' ? 'quaternion' : 'position'];
    const previous = values.slice(-4);
    // Preserve quaternion continuity when glTF interpolates neighboring samples.
    const sign = path === 'rotation' && previous.length &&
      value.dot(new Quaternion(...previous)) < 0 ? -1 : 1;
    values.push(...value.toArray().map(component => component * sign));
  }

  const contacts = arms.map(({ upper }) => {
    const x = world(upper).x;
    const side = Math.sign(x);
    return new Vector3(x + side * (underhand ? -0.035 : 0.065), wristY, barZ + (underhand ? 0.022 : -0.022));
  });
  const grips = [];
  for (const time of times) {
    // Pull up briskly, settle briefly at the top, then lower under control.
    const rep = ease((time - 0.22) / 0.83) - ease((time - 1.24) / 1.46);
    const swing = ease((time - 0.41) / 0.96) - ease((time - 1.69) / 1.31);
    const followThrough = ease((time - 2.02) / 0.54) - ease((time - 2.63) / 0.57);
    bones.forEach((node, index) => node.quaternion.copy(rest[index]));
    root.position.y = (underhand ? 0.39 : 0.38) * rep;
    root.position.z = -0.15 * rep;
    const head = world(bone('Head'));
    const headY = head.y + 0.073;
    const verticalGap = headY - barY;
    if (Math.abs(verticalGap) < headClearance) {
      const requiredGap = Math.sqrt(headClearance**2 - verticalGap**2);
      root.position.z -= Math.max(0, requiredGap - (barZ - head.z));
    }
    const clearedHead = world(bone('Head'));
    if (Math.hypot(verticalGap, barZ - clearedHead.z) < headClearance - 0.0001) {
      throw new Error('Head intersects the bar clearance envelope');
    }
    // Swing the legs forward to balance the upper body's clearance arc.
    // This is an authored counterbalance using an approximate leg lever arm.
    const legCounterbalance = Math.asin(Math.min(0.43, -2 * root.position.z / 0.65));
    record(root, 'translation');
    arms.forEach(({ upper, lower, hand, clavicle, clavicleRest, a, b }, index) => {
      clavicle.position.copy(clavicleRest);
      const down = up.clone().transformDirection(clavicle.parent.matrixWorld.clone().invert());
      clavicle.position.addScaledVector(down, -0.025 * rep);
      record(clavicle, 'translation');
      const origin = world(upper);
      const wrist = contacts[index];
      const direction = wrist.clone().sub(origin);
      const distance = direction.length();
      if (distance >= a + b || distance <= Math.abs(a - b)) throw new Error('Grip outside arm reach');
      direction.normalize();
      const along = (a*a - b*b + distance*distance) / (2 * distance);
      // Steer elbows down and out for the overhand grip, closer to the ribs
      // for the underhand grip. Project the pole into the plane of the solve.
      const side = Math.sign(wrist.x);
      const pole = new Vector3(side * (underhand ? 0.14 : 0.48), -1, underhand ? 1.35 : 1.05);
      pole.addScaledVector(direction, -pole.dot(direction)).normalize();
      const elbow = origin.clone().addScaledVector(direction, along)
        .addScaledVector(pole, Math.sqrt(a*a - along*along));
      const flexion = Math.PI - origin.clone().sub(elbow).angleTo(wrist.clone().sub(elbow));
      if (flexion > 145 * Math.PI / 180 || (rep > 0.85 && elbow.y >= origin.y - 0.035)) {
        throw new Error(`Elbow pose outside exercise limits: grip=${underhand ? 'underhand' : 'overhand'}, time=${time}, flexion=${flexion * 180 / Math.PI}, drop=${origin.y - elbow.y}`);
      }
      aim(upper, lower, elbow);
      aim(lower, hand, wrist);
      // Supination happens at the forearm. Counter-rotate the wrist to keep
      // the grip orientation fixed against the bar throughout each rep.
      if (underhand) lower.rotateY(Math.PI * 0.7);
      if (world(hand).distanceTo(wrist) > 0.001) throw new Error('The wrist lost contact');
      if (time === 0) grips[index] = hand.getWorldQuaternion(new Quaternion());
      hand.quaternion.copy(lower.getWorldQuaternion(new Quaternion()).invert().multiply(grips[index]));
      record(upper, 'rotation');
      record(lower, 'rotation');
      record(hand, 'rotation');
    });
    for (const side of ['l', 'r']) {
      const thigh = bone(`thigh_${side}`);
      const calf = bone(`calf_${side}`);
      pitch(thigh, -legCounterbalance - 0.04 * swing + 0.045 * followThrough);
      pitch(calf, 0.08 * swing + 0.035 * followThrough);
      record(thigh, 'rotation');
      record(calf, 'rotation');
    }
  }
  return tracks;
}
function accessor(values, type) {
  const data = Buffer.from(new Float32Array(values).buffer);
  const view = asset.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length }) - 1;
  offset += data.length;
  binary.push(data);
  const components = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
  const bounds = type === 'SCALAR' ? { min: [values[0]], max: [values.at(-1)] } : {};
  return asset.accessors.push({ bufferView: view, componentType: 5126, count: values.length / components, type, ...bounds }) - 1;
}
const input = accessor(times, 'SCALAR');
asset.animations = [false, true].map(underhand => {
  root.position.set(0, 0, 0);
  bones.forEach((node, index) => node.quaternion.copy(rest[index]));
  arms.forEach(({ clavicle, clavicleRest }) => clavicle.position.copy(clavicleRest));
  const animation = { name: underhand ? 'Chin-up' : 'Pull-up', samplers: [], channels: [] };
  for (const [key, values] of bakeGrip(underhand)) {
    const [node, path] = key.split(':');
    const output = accessor(values, path === 'rotation' ? 'VEC4' : 'VEC3');
    const sampler = animation.samplers.push({ input, output }) - 1;
    animation.channels.push({ sampler, target: { node: Number(node), path } });
  }
  return animation;
});
asset.extras = { barY, barZ };
asset.buffers[0].byteLength = offset;
let json = Buffer.from(JSON.stringify(asset));
json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
const header = Buffer.alloc(20);
header.write('glTF');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + json.length + offset, 8);
header.writeUInt32LE(json.length, 12);
header.write('JSON', 16);
const dataHeader = Buffer.alloc(8);
dataHeader.writeUInt32LE(offset);
dataHeader.write('BIN\0', 4);
writeFileSync(new URL('../public/pull-up.glb', import.meta.url), Buffer.concat([header, json, dataHeader, ...binary]));
