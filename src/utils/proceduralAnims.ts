import * as THREE from 'three';
import { TestAnimationType, LimbLocks } from '../types/rig';

export interface RobotStickState {
  rightStick: { x: number; y: number }; // X: -1..1 (abduction/reach), Y: -1..1 (elevation)
  leftStick: { x: number; y: number };  // X: -1..1 (abduction/reach), Y: -1..1 (elevation)
}

/**
 * Procedural bone deformation engine for the In-App Test Bench.
 * Directly animates the bone hierarchy rotations based on time,
 * providing instant realistic feedback without requiring pre-baked animation files.
 * Supports limb locks (freeze/isolate specific body parts) and virtual stick puppeteering.
 */
export function updateProceduralAnimation(
  boneMap: Map<string, THREE.Bone>,
  animation: TestAnimationType,
  time: number,
  limbLocks?: LimbLocks,
  stickOverrides?: RobotStickState
) {
  // Reset non-locked bones to rest rotation
  for (const [id, bone] of boneMap.entries()) {
    if (isBoneLocked(id, limbLocks)) {
      continue; // Keep current frozen rotation
    }
    bone.rotation.set(0, 0, 0);
  }

  const speedMultiplier = 3.2;
  const t = time * speedMultiplier;

  if (animation === 'rest') {
    if (stickOverrides) {
      applyStickPuppeteering(boneMap, stickOverrides, limbLocks);
    }
    return;
  }

  // Helper to safely rotate a bone if not locked
  const applyRotation = (id: string, rx?: number, ry?: number, rz?: number) => {
    if (isBoneLocked(id, limbLocks)) return;
    const bone = boneMap.get(id);
    if (!bone) return;
    if (rx !== undefined) bone.rotation.x = rx;
    if (ry !== undefined) bone.rotation.y = ry;
    if (rz !== undefined) bone.rotation.z = rz;
  };

  if (animation === 'walk') {
    // Continuous Walk Cycle
    const pelvis = boneMap.get('pelvis');
    if (pelvis && !isBoneLocked('pelvis', limbLocks)) {
      pelvis.position.y += Math.sin(t * 2) * 0.015;
      pelvis.rotation.z = Math.sin(t) * 0.04;
      pelvis.rotation.y = Math.cos(t) * 0.06;
    }

    applyRotation('spine', undefined, -Math.cos(t) * 0.05, undefined);

    const legSwing = 0.55;
    applyRotation('left_hip', Math.sin(t) * legSwing, 0, 0);
    applyRotation('right_hip', -Math.sin(t) * legSwing, 0, 0);

    const lKneePhase = Math.sin(t);
    const rKneePhase = -Math.sin(t);
    applyRotation('left_knee', lKneePhase < 0 ? -lKneePhase * 0.8 : 0.05, 0, 0);
    applyRotation('right_knee', rKneePhase < 0 ? -rKneePhase * 0.8 : 0.05, 0, 0);

    applyRotation('left_ankle', Math.cos(t) * 0.2, 0, 0);
    applyRotation('right_ankle', -Math.cos(t) * 0.2, 0, 0);

    const armSwing = 0.45;
    applyRotation('left_shoulder', -Math.sin(t) * armSwing, 0, 0.1);
    applyRotation('right_shoulder', Math.sin(t) * armSwing, 0, -0.1);

    applyRotation('left_wrist', 0.2 + Math.max(0, -Math.sin(t)) * 0.3, 0, 0);
    applyRotation('right_wrist', 0.2 + Math.max(0, Math.sin(t)) * 0.3, 0, 0);

  } else if (animation === 'intermittent_walk') {
    // Intermittent Walk: walks for 3.5 seconds, pauses to look around for 2 seconds, resumes
    const cyclePeriod = 5.5;
    const cycleTime = (t * 0.4) % cyclePeriod;
    const isWalking = cycleTime < 3.5;
    const walkBlend = isWalking ? Math.min(1, cycleTime * 2) : Math.max(0, 1 - (cycleTime - 3.5) * 3);

    if (isWalking) {
      const wT = t * 1.1;
      const legSwing = 0.55 * walkBlend;
      applyRotation('left_hip', Math.sin(wT) * legSwing, 0, 0);
      applyRotation('right_hip', -Math.sin(wT) * legSwing, 0, 0);

      const lKneePhase = Math.sin(wT);
      const rKneePhase = -Math.sin(wT);
      applyRotation('left_knee', (lKneePhase < 0 ? -lKneePhase * 0.8 : 0.05) * walkBlend, 0, 0);
      applyRotation('right_knee', (rKneePhase < 0 ? -rKneePhase * 0.8 : 0.05) * walkBlend, 0, 0);

      const armSwing = 0.45 * walkBlend;
      applyRotation('left_shoulder', -Math.sin(wT) * armSwing, 0, 0.1);
      applyRotation('right_shoulder', Math.sin(wT) * armSwing, 0, -0.1);
    } else {
      // Pause phase: weight shift to right foot, look around
      const pauseT = cycleTime - 3.5;
      const weightShift = Math.sin(pauseT * Math.PI / 2);
      applyRotation('pelvis', 0, 0.05 * weightShift, -0.04 * weightShift);
      applyRotation('left_hip', 0.08, 0, 0.06);
      applyRotation('right_hip', -0.02, 0, -0.03);
      applyRotation('head', -0.05, Math.sin(pauseT * 2.5) * 0.35, 0.04);
      applyRotation('chest', 0, Math.sin(pauseT * 2.5) * 0.15, 0);
      applyRotation('left_shoulder', 0.1, 0, 0.2);
      applyRotation('right_shoulder', 0.1, 0, -0.2);
    }

  } else if (animation === 'ambient_crowd') {
    // Intermittent Crowd / Ambient Idle (natural weight shifts, breathing, subtle glance)
    const breath = Math.sin(t * 0.65);
    const shift = Math.sin(t * 0.35);
    const glance = Math.sin(t * 0.22);

    // Subtle breathing expansion
    applyRotation('chest', breath * 0.035, 0, 0);
    applyRotation('spine', breath * 0.02, shift * 0.04, 0);

    // Natural pelvic weight shift
    applyRotation('pelvis', 0, shift * 0.03, shift * 0.025);
    applyRotation('left_hip', shift > 0 ? 0.05 : -0.02, 0, shift * 0.02);
    applyRotation('right_hip', shift < 0 ? 0.05 : -0.02, 0, -shift * 0.02);

    // Relaxed arms hanging with micro-sway
    applyRotation('left_shoulder', breath * 0.02, 0, 0.15 + shift * 0.03);
    applyRotation('right_shoulder', breath * 0.02, 0, -0.15 - shift * 0.03);
    applyRotation('left_elbow', 0.08 + breath * 0.03, 0, 0);
    applyRotation('right_elbow', 0.08 + breath * 0.03, 0, 0);

    // Intermittent glance
    applyRotation('neck', 0, glance * 0.18, 0);
    applyRotation('head', breath * 0.02, glance * 0.25, glance * 0.05);

  } else if (animation === 'hands_on_hips') {
    // Akimbo Pose: Hands touching hips / waist
    // Shoulders retracted, elbows flexed outward, hands on iliac crests
    const subtleBreath = Math.sin(t * 0.7) * 0.02;

    applyRotation('chest', 0.05 + subtleBreath, 0, 0);
    applyRotation('spine', -0.02, 0, 0);

    // Left Arm touching left hip
    applyRotation('left_shoulder', -0.15, -0.3, 0.65);
    applyRotation('left_elbow', 0.4, 0.2, -1.55); // deep elbow bend back towards hip
    applyRotation('left_wrist', 0.35, 0, 0.4);

    // Right Arm touching right hip
    applyRotation('right_shoulder', -0.15, 0.3, -0.65);
    applyRotation('right_elbow', 0.4, -0.2, 1.55);
    applyRotation('right_wrist', 0.35, 0, -0.4);

    // Stately standing legs
    applyRotation('left_hip', 0, 0, 0.06);
    applyRotation('right_hip', 0, 0, -0.06);
    applyRotation('head', -0.05, Math.sin(t * 0.3) * 0.08, 0);

  } else if (animation === 'robot_servo') {
    // Robotic Axis Servo Calibration Test
    const step = Math.floor((t * 0.8) % 4);
    const subPhase = Math.sin(t * 3.2);

    if (step === 0) {
      // Axis 1: Right Arm Elevation & Yaw
      applyRotation('right_shoulder', subPhase * 0.8, subPhase * 0.5, -0.8);
      applyRotation('right_elbow', 0.5, 0, 0);
    } else if (step === 1) {
      // Axis 2: Left Arm Elevation & Flex
      applyRotation('left_shoulder', subPhase * 0.8, -subPhase * 0.5, 0.8);
      applyRotation('left_elbow', 0.5, 0, 0);
    } else if (step === 2) {
      // Axis 3: Torso & Spine Yaw Rotation
      applyRotation('spine', 0, subPhase * 0.7, 0);
      applyRotation('chest', 0, subPhase * 0.5, 0);
      applyRotation('head', 0, -subPhase * 0.6, 0);
    } else {
      // Axis 4: Leg Pitch Flexion
      applyRotation('left_hip', subPhase * 0.6, 0, 0);
      applyRotation('left_knee', Math.max(0, subPhase) * 1.1, 0, 0);
    }

  } else if (animation === 'wave') {
    // Arm Wave Celebration
    applyRotation('right_shoulder', 0, 0.2, -1.2 + Math.sin(t * 0.5) * 0.1);
    applyRotation('right_elbow', 0, Math.cos(t * 2.5) * 0.2, -0.8 + Math.sin(t * 2.5) * 0.55);
    applyRotation('right_wrist', 0, 0, Math.sin(t * 3.5) * 0.35);
    applyRotation('head', 0, Math.sin(t * 0.8) * 0.15, -0.05);
    applyRotation('chest', 0, 0, -0.05 + Math.sin(t * 1.5) * 0.04);

  } else if (animation === 'squat') {
    // Deep Squat & Crouch Test
    const squatFactor = (Math.sin(t * 0.8) + 1) * 0.5;
    const pelvis = boneMap.get('pelvis');
    if (pelvis && !isBoneLocked('pelvis', limbLocks)) {
      pelvis.position.y -= squatFactor * 0.28;
    }
    applyRotation('spine', squatFactor * 0.35, 0, 0);
    applyRotation('chest', squatFactor * 0.15, 0, 0);
    applyRotation('left_hip', -squatFactor * 1.35, 0, squatFactor * 0.15);
    applyRotation('right_hip', -squatFactor * 1.35, 0, -squatFactor * 0.15);
    applyRotation('left_knee', squatFactor * 1.55, 0, 0);
    applyRotation('right_knee', squatFactor * 1.55, 0, 0);
    applyRotation('left_ankle', -squatFactor * 0.35, 0, 0);
    applyRotation('right_ankle', -squatFactor * 0.35, 0, 0);
    applyRotation('left_shoulder', squatFactor * 0.7, 0, 0);
    applyRotation('right_shoulder', squatFactor * 0.7, 0, 0);

  } else if (animation === 'twist') {
    // Torso Twist Test
    const twist = Math.sin(t * 1.2) * 0.65;
    applyRotation('spine', 0, twist * 0.5, 0);
    applyRotation('chest', 0, twist * 0.5, 0);
    applyRotation('neck', 0, -twist * 0.3, 0);
    applyRotation('head', 0, -twist * 0.2, 0);
    applyRotation('left_shoulder', 0, -twist * 0.3, 0);
    applyRotation('right_shoulder', 0, -twist * 0.3, 0);
  }

  // Apply stick puppeteering overrides to unlocked arms so virtual joysticks drive limbs live
  if (stickOverrides) {
    applyStickPuppeteering(boneMap, stickOverrides, limbLocks);
  }
}

/**
 * Checks if a specific bone is covered by active limb locks.
 */
function isBoneLocked(boneId: string, locks?: LimbLocks): boolean {
  if (!locks) return false;
  if (locks.leftArm && (boneId.startsWith('left_shoulder') || boneId.startsWith('left_elbow') || boneId.startsWith('left_wrist') || boneId.startsWith('left_hand'))) {
    return true;
  }
  if (locks.rightArm && (boneId.startsWith('right_shoulder') || boneId.startsWith('right_elbow') || boneId.startsWith('right_wrist') || boneId.startsWith('right_hand'))) {
    return true;
  }
  if (locks.legs && (boneId.includes('hip') || boneId.includes('knee') || boneId.includes('ankle') || boneId.includes('toe'))) {
    return true;
  }
  if (locks.torso && (boneId === 'pelvis' || boneId === 'spine' || boneId === 'chest')) {
    return true;
  }
  if (locks.head && (boneId === 'neck' || boneId === 'head')) {
    return true;
  }
  return false;
}

/**
 * Puppeteers arms or limbs using virtual gamepad / robotics teach pendant sticks.
 * Supports wider range of motion: touching hips, overhead reach, akimbo, crossing torso.
 */
function applyStickPuppeteering(
  boneMap: Map<string, THREE.Bone>,
  sticks: RobotStickState,
  locks?: LimbLocks
) {
  // Right Arm via Right Stick (if not locked)
  if (!locks?.rightArm) {
    const rx = sticks.rightStick.x; // -1 (tuck in touching hip) to +1 (abduct outwards)
    const ry = sticks.rightStick.y; // -1 (hang down touching hip) to +1 (raise overhead)

    const rShoulder = boneMap.get('right_shoulder');
    const rElbow = boneMap.get('right_elbow');
    const rWrist = boneMap.get('right_wrist');

    if (rShoulder) {
      // Rotation Z controls elevation (-1.9 overhead to +0.4 down)
      // Rotation X controls forward/back pitch
      rShoulder.rotation.z = -ry * 1.6 - rx * 0.6;
      rShoulder.rotation.x = rx * 0.9;
      rShoulder.rotation.y = (rx - ry) * 0.4;
    }
    if (rElbow) {
      // Wide flexion: touching hips or waist when deflected inward or downward
      const bendFactor = Math.max(0, -rx) * 2.0 + (ry < 0 ? (-ry * 0.8) : (Math.abs(rx) > 0.1 ? Math.abs(rx) * 1.2 : 0));
      rElbow.rotation.z = Math.min(2.4, bendFactor);
      rElbow.rotation.y = -rx * 0.7;
    }
    if (rWrist) {
      rWrist.rotation.y = rx * 0.6;
      rWrist.rotation.z = -rx * 0.5;
    }
  }

  // Left Arm via Left Stick (if not locked)
  if (!locks?.leftArm) {
    const lx = sticks.leftStick.x;
    const ly = sticks.leftStick.y;

    const lShoulder = boneMap.get('left_shoulder');
    const lElbow = boneMap.get('left_elbow');
    const lWrist = boneMap.get('left_wrist');

    if (lShoulder) {
      lShoulder.rotation.z = ly * 1.6 + lx * 0.6;
      lShoulder.rotation.x = lx * 0.9;
      lShoulder.rotation.y = -(lx - ly) * 0.4;
    }
    if (lElbow) {
      const bendFactor = Math.max(0, lx) * 2.0 + (ly < 0 ? (-ly * 0.8) : (Math.abs(lx) > 0.1 ? Math.abs(lx) * 1.2 : 0));
      lElbow.rotation.z = -Math.min(2.4, bendFactor);
      lElbow.rotation.y = lx * 0.7;
    }
    if (lWrist) {
      lWrist.rotation.y = -lx * 0.6;
      lWrist.rotation.z = lx * 0.5;
    }
  }
}
