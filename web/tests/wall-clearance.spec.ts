import { expect, test } from '@playwright/test';
import { Box3, Group } from 'three';
import { createRobot } from '../src/robot';
import { createWallMotion, wallAngles, wallDuration, wallSurface } from '../src/wall-motion';

test('all five drills keep the robot mesh in front of the wall', () => {
  wallAngles.forEach(({ name }, index) => {
    const scene = new Group();
    const motion = createWallMotion(index);
    const update = createRobot(motion.rig, scene, index === 0 ? 'flat' : true);
    const bounds = new Box3();
    let closest = -Infinity;
    for (let frame = 0; frame <= 480; frame++) {
      motion.pose(wallDuration * frame / 480);
      update(false);
      closest = Math.max(closest, bounds.setFromObject(scene, true).max.z);
    }
    expect(closest, name).toBeLessThan(wallSurface);
  });
});
