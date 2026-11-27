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
const up = new Vector3(0, 1, 0);
const tracks = new Map();
const times = [];
function record(node, path) {
  const key = bones.indexOf(node) + ':' + path;
  if (!tracks.has(key)) tracks.set(key, []);
  tracks.get(key).push(...node[path === 'rotation' ? 'quaternion' : 'position'].toArray());
}
const rest = bones.map(node => node.quaternion.clone());
const grip = new Map();
for (let frame = 0; frame <= 72; frame++) {
  times.push(frame / 30);
  const rep = (1 - Math.cos(frame / 72 * Math.PI * 2)) / 2;
  bones.forEach((node, index) => node.quaternion.copy(rest[index]));
  root.position.y = 0.055 * rep;
  record(root, 'translation');
  for (const { upper, lower, hand, clavicle, clavicleRest, a, b } of arms) {
    clavicle.position.copy(clavicleRest);
    const lift = up.clone().transformDirection(clavicle.parent.matrixWorld.clone().invert());
    clavicle.position.addScaledVector(lift, -0.05 * rep);
    record(clavicle, 'translation');
    const origin = world(upper);
    const wrist = new Vector3(origin.x, wristY, barZ);
    const direction = wrist.clone().sub(origin);
    const distance = direction.length();
    direction.normalize();
    const along = (a*a - b*b + distance*distance) / (2 * distance);
    const bend = new Vector3(0, 0, -1);
    bend.addScaledVector(direction, -bend.dot(direction)).normalize();
    const elbow = origin.clone().addScaledVector(direction, along)
      .addScaledVector(bend, Math.sqrt(Math.max(0, a*a - along*along)));
    aim(upper, lower, elbow);
    aim(lower, hand, wrist);
    if (world(hand).distanceTo(wrist) > 0.001) throw new Error('The wrist lost contact');
    record(upper, 'rotation');
    record(lower, 'rotation');
    // Keep the palm orientation fixed while the shoulder moves.
    if (frame === 0) grip.set(hand, hand.getWorldQuaternion(new Quaternion()));
    hand.quaternion.copy(lower.getWorldQuaternion(new Quaternion()).invert().multiply(grip.get(hand)));
    record(hand, 'rotation');
    const side = asset.nodes[bones.indexOf(hand)].name.at(-1);
    for (const finger of ['index', 'middle', 'ring', 'pinky']) {
      for (const [joint, next, angle] of [['01', '02', 0.28], ['02', '03', 1.0], ['03', '04_leaf', 1.65]]) {
        const segment = bone(`${finger}_${joint}_${side}`);
        const tip = bone(`${finger}_${next}_${side}`);
        const direction = new Vector3(0, Math.cos(angle), -Math.sin(angle));
        aim(segment, tip, world(segment).add(direction));
        record(segment, 'rotation');
      }
    }
  }
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
const animation = { name: 'Scapular pull-up', samplers: [], channels: [] };
for (const [key, values] of tracks) {
  const [node, path] = key.split(':');
  const output = accessor(values, path === 'rotation' ? 'VEC4' : 'VEC3');
  const sampler = animation.samplers.push({ input, output }) - 1;
  animation.channels.push({ sampler, target: { node: Number(node), path } });
}
asset.animations = [animation];
asset.extras = { barY: wristY + 0.07, barZ };
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
writeFileSync(new URL('../public/scapular-pull-up.glb', import.meta.url), Buffer.concat([header, json, dataHeader, ...binary]));
