import * as THREE from 'three';
import { BoneHierarchyDef, JointRecord } from '../types/rig';

/**
 * Anatomical landmarks based on anthropometric stature fractions:
 * Head Top: 1.000 (joint center at ~0.940)
 * Neck: 0.870
 * Shoulder: 0.818
 * Chest: 0.720
 * Spine: 0.620
 * Elbow: 0.630
 * Hip (Pelvis): 0.530
 * Wrist: 0.485
 * Knee: 0.285
 * Ankle: 0.039
 * Toe: 0.010
 */
export const BONE_DEFINITIONS: BoneHierarchyDef[] = [
  { id: 'pelvis', name: 'Pelvis', parentId: null, side: 'center', defaultStatureFraction: { y: 0.530, xOffset: 0.0, zOffset: 0.0 } },
  { id: 'spine', name: 'Spine', parentId: 'pelvis', side: 'center', defaultStatureFraction: { y: 0.620, xOffset: 0.0, zOffset: 0.005 } },
  { id: 'chest', name: 'Chest', parentId: 'spine', side: 'center', defaultStatureFraction: { y: 0.720, xOffset: 0.0, zOffset: 0.01 } },
  { id: 'neck', name: 'Neck', parentId: 'chest', side: 'center', defaultStatureFraction: { y: 0.870, xOffset: 0.0, zOffset: 0.0 } },
  { id: 'head', name: 'Head', parentId: 'neck', side: 'center', defaultStatureFraction: { y: 0.940, xOffset: 0.0, zOffset: 0.015 } },

  // Left Arm Chain
  { id: 'left_shoulder', name: 'Left_Shoulder', parentId: 'chest', side: 'left', defaultStatureFraction: { y: 0.818, xOffset: 0.105, zOffset: -0.005 } },
  { id: 'left_elbow', name: 'Left_Elbow', parentId: 'left_shoulder', side: 'left', defaultStatureFraction: { y: 0.630, xOffset: 0.260, zOffset: -0.01 } },
  { id: 'left_wrist', name: 'Left_Wrist', parentId: 'left_elbow', side: 'left', defaultStatureFraction: { y: 0.485, xOffset: 0.410, zOffset: 0.0 } },
  { id: 'left_hand', name: 'Left_Hand', parentId: 'left_wrist', side: 'left', defaultStatureFraction: { y: 0.440, xOffset: 0.450, zOffset: 0.005 } },

  // Right Arm Chain
  { id: 'right_shoulder', name: 'Right_Shoulder', parentId: 'chest', side: 'right', defaultStatureFraction: { y: 0.818, xOffset: -0.105, zOffset: -0.005 } },
  { id: 'right_elbow', name: 'Right_Elbow', parentId: 'right_shoulder', side: 'right', defaultStatureFraction: { y: 0.630, xOffset: -0.260, zOffset: -0.01 } },
  { id: 'right_wrist', name: 'Right_Wrist', parentId: 'right_elbow', side: 'right', defaultStatureFraction: { y: 0.485, xOffset: -0.410, zOffset: 0.0 } },
  { id: 'right_hand', name: 'Right_Hand', parentId: 'right_wrist', side: 'right', defaultStatureFraction: { y: 0.440, xOffset: -0.450, zOffset: 0.005 } },

  // Left Leg Chain
  { id: 'left_hip', name: 'Left_Hip', parentId: 'pelvis', side: 'left', defaultStatureFraction: { y: 0.505, xOffset: 0.065, zOffset: 0.0 } },
  { id: 'left_knee', name: 'Left_Knee', parentId: 'left_hip', side: 'left', defaultStatureFraction: { y: 0.285, xOffset: 0.065, zOffset: 0.015 } },
  { id: 'left_ankle', name: 'Left_Ankle', parentId: 'left_knee', side: 'left', defaultStatureFraction: { y: 0.039, xOffset: 0.065, zOffset: -0.01 } },
  { id: 'left_toe', name: 'Left_Toe', parentId: 'left_ankle', side: 'left', defaultStatureFraction: { y: 0.010, xOffset: 0.065, zOffset: 0.075 } },

  // Right Leg Chain
  { id: 'right_hip', name: 'Right_Hip', parentId: 'pelvis', side: 'right', defaultStatureFraction: { y: 0.505, xOffset: -0.065, zOffset: 0.0 } },
  { id: 'right_knee', name: 'Right_Knee', parentId: 'right_hip', side: 'right', defaultStatureFraction: { y: 0.285, xOffset: -0.065, zOffset: 0.015 } },
  { id: 'right_ankle', name: 'Right_Ankle', parentId: 'right_knee', side: 'right', defaultStatureFraction: { y: 0.039, xOffset: -0.065, zOffset: -0.01 } },
  { id: 'right_toe', name: 'Right_Toe', parentId: 'right_ankle', side: 'right', defaultStatureFraction: { y: 0.010, xOffset: -0.065, zOffset: 0.075 } }
];

export const SYMMETRIC_PAIRS: Record<string, string> = {
  left_shoulder: 'right_shoulder',
  right_shoulder: 'left_shoulder',
  left_elbow: 'right_elbow',
  right_elbow: 'left_elbow',
  left_wrist: 'right_wrist',
  right_wrist: 'left_wrist',
  left_hand: 'right_hand',
  right_hand: 'left_hand',
  left_hip: 'right_hip',
  right_hip: 'left_hip',
  left_knee: 'right_knee',
  right_knee: 'left_knee',
  left_ankle: 'right_ankle',
  right_ankle: 'left_ankle',
  left_toe: 'right_toe',
  right_toe: 'left_toe'
};

export interface ArmKinematicsOptions {
  spread?: number;       // -0.2 (hands touching hips) to 1.0 (T-pose) to 1.5 (raised overhead)
  pitch?: number;        // -0.5 (swept back) to 0.8 (extended forward)
  elbowFlex?: number;    // 0.0 (straight) to 1.0 (bent at elbow)
  handsTouchingHips?: boolean; // directly position hands onto iliac crest/hips
}

/**
 * Computes anthropometric skeleton positions scaled by model stature (footY to headY).
 * Supports wide-range kinematic arm movement (from touching hips to raised overhead).
 */
export function computeProportionalSkeleton(
  footY: number,
  headY: number,
  armOptions: number | ArmKinematicsOptions = 1.0,
  preserveUserEdited: boolean = false,
  existingRecords?: Map<string, JointRecord>
): Map<string, JointRecord> {
  const stature = Math.max(0.1, headY - footY);
  const result = new Map<string, JointRecord>();

  const opts: ArmKinematicsOptions = typeof armOptions === 'number'
    ? { spread: armOptions, pitch: 0, elbowFlex: 0, handsTouchingHips: false }
    : { spread: 1.0, pitch: 0, elbowFlex: 0, handsTouchingHips: false, ...armOptions };

  const spread = opts.spread ?? 1.0;
  const pitch = opts.pitch ?? 0.0;
  const elbowFlex = opts.elbowFlex ?? 0.0;
  const handsTouchingHips = opts.handsTouchingHips ?? false;

  // Base bone segment lengths computed proportionally to stature
  const upperArmLength = 0.165 * stature;
  const forearmLength = 0.155 * stature;
  const handLength = 0.055 * stature;

  // Arm spread angle (elevation relative to horizontal):
  // spread = 1.0 -> 0 rad (horizontal T-pose)
  // spread = 0.5 -> ~45 deg downward (A-pose)
  // spread = 0.0 -> ~75 deg downward (relaxed)
  // spread = -0.2 -> ~88 deg downward (hands touching sides/hips)
  // spread = 1.4 -> ~60 deg upward (raised arms)
  const armAngleRad = (1.0 - THREE.MathUtils.clamp(spread, -0.3, 1.5)) * THREE.MathUtils.degToRad(75);
  const pitchAngleRad = (pitch ?? 0) * THREE.MathUtils.degToRad(60);

  for (const def of BONE_DEFINITIONS) {
    if (preserveUserEdited && existingRecords) {
      const existing = existingRecords.get(def.id);
      if (existing && existing.userEdited) {
        result.set(def.id, { ...existing });
        continue;
      }
    }

    let px = def.defaultStatureFraction.xOffset * stature;
    let py = footY + def.defaultStatureFraction.y * stature;
    let pz = def.defaultStatureFraction.zOffset * stature;

    // Special: Hands Touching Hips (Akimbo)
    if (handsTouchingHips) {
      if (def.id === 'left_elbow') {
        px = 0.22 * stature;
        py = footY + 0.62 * stature;
        pz = -0.04 * stature;
      } else if (def.id === 'left_wrist') {
        px = 0.13 * stature; // touching outer hip
        py = footY + 0.51 * stature;
        pz = 0.02 * stature;
      } else if (def.id === 'left_hand') {
        px = 0.12 * stature;
        py = footY + 0.47 * stature;
        pz = 0.04 * stature;
      } else if (def.id === 'right_elbow') {
        px = -0.22 * stature;
        py = footY + 0.62 * stature;
        pz = -0.04 * stature;
      } else if (def.id === 'right_wrist') {
        px = -0.13 * stature; // touching outer hip
        py = footY + 0.51 * stature;
        pz = 0.02 * stature;
      } else if (def.id === 'right_hand') {
        px = -0.12 * stature;
        py = footY + 0.47 * stature;
        pz = 0.04 * stature;
      }
    } else if (def.id === 'left_elbow' || def.id === 'left_wrist' || def.id === 'left_hand') {
      // Left Arm Kinematic Arc
      const shoulderX = 0.105 * stature;
      const shoulderY = footY + 0.818 * stature;
      const shoulderZ = -0.005 * stature;

      const cosA = Math.cos(armAngleRad);
      const sinA = Math.sin(armAngleRad);
      const sinP = Math.sin(pitchAngleRad);
      const cosP = Math.cos(pitchAngleRad);

      if (def.id === 'left_elbow') {
        px = shoulderX + upperArmLength * cosA * cosP;
        py = shoulderY - upperArmLength * sinA;
        pz = shoulderZ + upperArmLength * sinP;
      } else if (def.id === 'left_wrist') {
        // Forearm with optional elbow flexion
        const flexAngle = elbowFlex * THREE.MathUtils.degToRad(85);
        const foreCos = Math.cos(armAngleRad - flexAngle);
        const foreSin = Math.sin(armAngleRad - flexAngle);

        const elbowX = shoulderX + upperArmLength * cosA * cosP;
        const elbowY = shoulderY - upperArmLength * sinA;
        const elbowZ = shoulderZ + upperArmLength * sinP;

        px = elbowX + forearmLength * foreCos * cosP - (elbowFlex * 0.05 * stature);
        py = elbowY - forearmLength * foreSin;
        pz = elbowZ + forearmLength * sinP;
      } else if (def.id === 'left_hand') {
        const elbowX = shoulderX + upperArmLength * cosA * cosP;
        const elbowY = shoulderY - upperArmLength * sinA;
        const elbowZ = shoulderZ + upperArmLength * sinP;

        const flexAngle = elbowFlex * THREE.MathUtils.degToRad(85);
        const foreCos = Math.cos(armAngleRad - flexAngle);
        const foreSin = Math.sin(armAngleRad - flexAngle);
        const totalForeLen = forearmLength + handLength;

        px = elbowX + totalForeLen * foreCos * cosP - (elbowFlex * 0.07 * stature);
        py = elbowY - totalForeLen * foreSin;
        pz = elbowZ + totalForeLen * sinP + 0.005 * stature;
      }
    } else if (def.id === 'right_elbow' || def.id === 'right_wrist' || def.id === 'right_hand') {
      // Right Arm Kinematic Arc
      const shoulderX = -0.105 * stature;
      const shoulderY = footY + 0.818 * stature;
      const shoulderZ = -0.005 * stature;

      const cosA = Math.cos(armAngleRad);
      const sinA = Math.sin(armAngleRad);
      const sinP = Math.sin(pitchAngleRad);
      const cosP = Math.cos(pitchAngleRad);

      if (def.id === 'right_elbow') {
        px = shoulderX - upperArmLength * cosA * cosP;
        py = shoulderY - upperArmLength * sinA;
        pz = shoulderZ + upperArmLength * sinP;
      } else if (def.id === 'right_wrist') {
        const flexAngle = elbowFlex * THREE.MathUtils.degToRad(85);
        const foreCos = Math.cos(armAngleRad - flexAngle);
        const foreSin = Math.sin(armAngleRad - flexAngle);

        const elbowX = shoulderX - upperArmLength * cosA * cosP;
        const elbowY = shoulderY - upperArmLength * sinA;
        const elbowZ = shoulderZ + upperArmLength * sinP;

        px = elbowX - forearmLength * foreCos * cosP + (elbowFlex * 0.05 * stature);
        py = elbowY - forearmLength * foreSin;
        pz = elbowZ + forearmLength * sinP;
      } else if (def.id === 'right_hand') {
        const elbowX = shoulderX - upperArmLength * cosA * cosP;
        const elbowY = shoulderY - upperArmLength * sinA;
        const elbowZ = shoulderZ + upperArmLength * sinP;

        const flexAngle = elbowFlex * THREE.MathUtils.degToRad(85);
        const foreCos = Math.cos(armAngleRad - flexAngle);
        const foreSin = Math.sin(armAngleRad - flexAngle);
        const totalForeLen = forearmLength + handLength;

        px = elbowX - totalForeLen * foreCos * cosP + (elbowFlex * 0.07 * stature);
        py = elbowY - totalForeLen * foreSin;
        pz = elbowZ + totalForeLen * sinP + 0.005 * stature;
      }
    }

    result.set(def.id, {
      id: def.id,
      name: def.name,
      parentId: def.parentId,
      positionModelSpace: [px, py, pz],
      userEdited: false,
      source: 'proportional',
      color: def.side === 'center' ? '#38bdf8' : def.side === 'left' ? '#34d399' : '#f87171'
    });
  }

  return result;
}

/**
 * Calculates model bounding dimensions and recommended head/foot planes.
 */
export function analyzeModelStature(object: THREE.Object3D): { minY: number; maxY: number; height: number; center: THREE.Vector3 } {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    return { minY: 0, maxY: 1.8, height: 1.8, center: new THREE.Vector3(0, 0.9, 0) };
  }
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  return {
    minY: box.min.y,
    maxY: box.max.y,
    height: Math.max(0.2, size.y),
    center
  };
}
