import * as THREE from 'three';
import { JointRecord } from '../types/rig';
import { BONE_DEFINITIONS } from './anthropometry';

export interface IKChainResult {
  root: THREE.Vector3;
  mid: THREE.Vector3;
  end: THREE.Vector3;
}

/**
 * Analytical Two-Bone Inverse Kinematics solver.
 * Finds the exact mid-joint position (elbow/knee) preserving lengths L1 and L2,
 * bending towards the pole vector without any bone stretching.
 */
export function solveTwoBoneIK(
  root: THREE.Vector3,
  target: THREE.Vector3,
  l1: number,
  l2: number,
  poleVector: THREE.Vector3
): THREE.Vector3 {
  const rootToTarget = new THREE.Vector3().subVectors(target, root);
  let dist = rootToTarget.length();

  // Clamp dist to prevent bone stretching or hyperextension singularity
  const maxReach = (l1 + l2) * 0.9999;
  const minReach = Math.max(0.01, Math.abs(l1 - l2) * 1.0001);

  if (dist > maxReach) {
    dist = maxReach;
  } else if (dist < minReach) {
    dist = minReach;
  }

  // Law of Cosines for the angle at root
  // l2^2 = l1^2 + dist^2 - 2 * l1 * dist * cos(alpha)
  const cosAlpha = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const clampedCosAlpha = THREE.MathUtils.clamp(cosAlpha, -1, 1);
  const alpha = Math.acos(clampedCosAlpha);

  const forward = rootToTarget.clone().normalize();
  
  // Calculate bending normal plane using pole vector
  let bendDir = poleVector.clone().sub(root);
  // Project bendDir onto plane perpendicular to forward vector
  bendDir.addScaledVector(forward, -bendDir.dot(forward));
  if (bendDir.lengthSq() < 1e-6) {
    // Fallback if pole vector is parallel to forward
    bendDir = new THREE.Vector3(0, 0, 1).cross(forward);
    if (bendDir.lengthSq() < 1e-6) {
      bendDir = new THREE.Vector3(1, 0, 0).cross(forward);
    }
  }
  bendDir.normalize();

  // Mid joint position is rotated by alpha from forward vector towards bendDir
  const midOffset = forward.clone().multiplyScalar(Math.cos(alpha) * l1)
    .add(bendDir.clone().multiplyScalar(Math.sin(alpha) * l1));

  return root.clone().add(midOffset);
}

export interface MannequinPoseConfig {
  name: string;
  description: string;
  pelvisY: number; // relative to base stature
  pelvisZ: number;
  leftHandTarget: [number, number, number];
  rightHandTarget: [number, number, number];
  leftFootTarget: [number, number, number];
  rightFootTarget: [number, number, number];
  leftElbowPole: [number, number, number];
  rightElbowPole: [number, number, number];
  leftKneePole: [number, number, number];
  rightKneePole: [number, number, number];
  torsoPitchRad: number;
}

export const MANNEQUIN_PRESETS: Record<string, MannequinPoseConfig> = {
  t_pose: {
    name: 'T-Pose (Rest)',
    description: 'Orthogonal calibration pose with horizontal arms',
    pelvisY: 0.530,
    pelvisZ: 0.0,
    leftHandTarget: [0.45, 0.818, 0.0],
    rightHandTarget: [-0.45, 0.818, 0.0],
    leftFootTarget: [0.065, 0.039, 0.0],
    rightFootTarget: [-0.065, 0.039, 0.0],
    leftElbowPole: [0.26, 0.818, -0.2],
    rightElbowPole: [-0.26, 0.818, -0.2],
    leftKneePole: [0.065, 0.285, 0.2],
    rightKneePole: [-0.065, 0.285, 0.2],
    torsoPitchRad: 0.0
  },
  a_pose: {
    name: 'A-Pose (Natural Stand)',
    description: 'Relaxed arms at 45 degrees, ready for scan or clothing',
    pelvisY: 0.530,
    pelvisZ: 0.0,
    leftHandTarget: [0.36, 0.55, 0.0],
    rightHandTarget: [-0.36, 0.55, 0.0],
    leftFootTarget: [0.065, 0.039, 0.0],
    rightFootTarget: [-0.065, 0.039, 0.0],
    leftElbowPole: [0.25, 0.65, -0.15],
    rightElbowPole: [-0.25, 0.65, -0.15],
    leftKneePole: [0.065, 0.285, 0.2],
    rightKneePole: [-0.065, 0.285, 0.2],
    torsoPitchRad: 0.0
  },
  crouched: {
    name: 'Crouched Combat',
    description: 'Low center of gravity, deep knee flexion, tactical guard',
    pelvisY: 0.360,
    pelvisZ: -0.06,
    leftHandTarget: [0.18, 0.55, 0.28],
    rightHandTarget: [-0.18, 0.58, 0.22],
    leftFootTarget: [0.14, 0.039, 0.12],
    rightFootTarget: [-0.12, 0.039, -0.15],
    leftElbowPole: [0.35, 0.42, 0.15],
    rightElbowPole: [-0.35, 0.45, 0.05],
    leftKneePole: [0.20, 0.22, 0.35],
    rightKneePole: [-0.15, 0.18, 0.15],
    torsoPitchRad: 0.25
  },
  seated: {
    name: 'Seated (Chair)',
    description: '90-degree hip and knee bend with hands on thighs',
    pelvisY: 0.340,
    pelvisZ: -0.12,
    leftHandTarget: [0.11, 0.35, 0.18],
    rightHandTarget: [-0.11, 0.35, 0.18],
    leftFootTarget: [0.11, 0.039, 0.22],
    rightFootTarget: [-0.11, 0.039, 0.22],
    leftElbowPole: [0.22, 0.48, -0.05],
    rightElbowPole: [-0.22, 0.48, -0.05],
    leftKneePole: [0.11, 0.34, 0.35],
    rightKneePole: [-0.11, 0.34, 0.35],
    torsoPitchRad: 0.05
  },
  hero_stance: {
    name: 'Hero Action Lunge',
    description: 'Dynamic weight shift, one leg back, arms in action guard',
    pelvisY: 0.460,
    pelvisZ: 0.02,
    leftHandTarget: [0.25, 0.72, 0.22],
    rightHandTarget: [-0.28, 0.45, -0.08],
    leftFootTarget: [0.14, 0.039, 0.20],
    rightFootTarget: [-0.14, 0.039, -0.22],
    leftElbowPole: [0.32, 0.65, 0.05],
    rightElbowPole: [-0.35, 0.52, -0.2],
    leftKneePole: [0.16, 0.26, 0.32],
    rightKneePole: [-0.14, 0.22, -0.05],
    torsoPitchRad: 0.12
  }
};

/**
 * Generates skeleton JointRecords from kinematic IK mannequin pose.
 * Note: Body-size scale is independent of crouched height!
 * We scale by the model's unbent stature (footY to headY) so crouching preserves anatomical bone lengths.
 */
export function generatePoseTransferJoints(
  presetKey: string,
  modelFootY: number,
  modelHeadY: number,
  customPose?: Partial<MannequinPoseConfig>
): Map<string, JointRecord> {
  const config = { ...(MANNEQUIN_PRESETS[presetKey] || MANNEQUIN_PRESETS.a_pose), ...customPose };
  const stature = Math.max(0.1, modelHeadY - modelFootY);
  const result = new Map<string, JointRecord>();

  // Bone lengths proportional to full stature
  const upperArmLen = 0.165 * stature;
  const forearmLen = 0.155 * stature;
  const thighLen = 0.245 * stature;
  const calfLen = 0.246 * stature;

  // Pelvis position
  const pelvisPos = new THREE.Vector3(
    0.0,
    modelFootY + config.pelvisY * stature,
    config.pelvisZ * stature
  );

  // Torso tilt rotation
  const pitchSin = Math.sin(config.torsoPitchRad);
  const pitchCos = Math.cos(config.torsoPitchRad);

  // Spine & Chest
  const spineOffset = 0.09 * stature;
  const spinePos = new THREE.Vector3(
    0.0,
    pelvisPos.y + spineOffset * pitchCos,
    pelvisPos.z + spineOffset * pitchSin
  );

  const chestOffset = 0.19 * stature;
  const chestPos = new THREE.Vector3(
    0.0,
    pelvisPos.y + chestOffset * pitchCos,
    pelvisPos.z + chestOffset * pitchSin
  );

  const neckOffset = 0.33 * stature;
  const neckPos = new THREE.Vector3(
    0.0,
    pelvisPos.y + neckOffset * pitchCos,
    pelvisPos.z + neckOffset * pitchSin
  );

  const headOffset = 0.41 * stature;
  const headPos = new THREE.Vector3(
    0.0,
    pelvisPos.y + headOffset * pitchCos,
    pelvisPos.z + headOffset * pitchSin
  );

  // Left Leg IK
  const leftHipPos = new THREE.Vector3(0.065 * stature, pelvisPos.y - 0.025 * stature, pelvisPos.z);
  const leftFootTarget = new THREE.Vector3(
    config.leftFootTarget[0] * stature,
    modelFootY + config.leftFootTarget[1] * stature,
    config.leftFootTarget[2] * stature
  );
  const leftKneePole = new THREE.Vector3(
    config.leftKneePole[0] * stature,
    modelFootY + config.leftKneePole[1] * stature,
    config.leftKneePole[2] * stature
  );
  const leftKneePos = solveTwoBoneIK(leftHipPos, leftFootTarget, thighLen, calfLen, leftKneePole);
  const leftToePos = new THREE.Vector3(leftFootTarget.x, leftFootTarget.y - 0.029 * stature, leftFootTarget.z + 0.075 * stature);

  // Right Leg IK
  const rightHipPos = new THREE.Vector3(-0.065 * stature, pelvisPos.y - 0.025 * stature, pelvisPos.z);
  const rightFootTarget = new THREE.Vector3(
    config.rightFootTarget[0] * stature,
    modelFootY + config.rightFootTarget[1] * stature,
    config.rightFootTarget[2] * stature
  );
  const rightKneePole = new THREE.Vector3(
    config.rightKneePole[0] * stature,
    modelFootY + config.rightKneePole[1] * stature,
    config.rightKneePole[2] * stature
  );
  const rightKneePos = solveTwoBoneIK(rightHipPos, rightFootTarget, thighLen, calfLen, rightKneePole);
  const rightToePos = new THREE.Vector3(rightFootTarget.x, rightFootTarget.y - 0.029 * stature, rightFootTarget.z + 0.075 * stature);

  // Left Arm IK
  const leftShoulderPos = new THREE.Vector3(0.105 * stature, chestPos.y + 0.098 * stature * pitchCos, chestPos.z + 0.098 * stature * pitchSin);
  const leftHandTarget = new THREE.Vector3(
    config.leftHandTarget[0] * stature,
    modelFootY + config.leftHandTarget[1] * stature,
    config.leftHandTarget[2] * stature
  );
  const leftElbowPole = new THREE.Vector3(
    config.leftElbowPole[0] * stature,
    modelFootY + config.leftElbowPole[1] * stature,
    config.leftElbowPole[2] * stature
  );
  const leftElbowPos = solveTwoBoneIK(leftShoulderPos, leftHandTarget, upperArmLen, forearmLen, leftElbowPole);
  const leftHandTip = leftHandTarget.clone().add(leftHandTarget.clone().sub(leftElbowPos).normalize().multiplyScalar(0.04 * stature));

  // Right Arm IK
  const rightShoulderPos = new THREE.Vector3(-0.105 * stature, chestPos.y + 0.098 * stature * pitchCos, chestPos.z + 0.098 * stature * pitchSin);
  const rightHandTarget = new THREE.Vector3(
    config.rightHandTarget[0] * stature,
    modelFootY + config.rightHandTarget[1] * stature,
    config.rightHandTarget[2] * stature
  );
  const rightElbowPole = new THREE.Vector3(
    config.rightElbowPole[0] * stature,
    modelFootY + config.rightElbowPole[1] * stature,
    config.rightElbowPole[2] * stature
  );
  const rightElbowPos = solveTwoBoneIK(rightShoulderPos, rightHandTarget, upperArmLen, forearmLen, rightElbowPole);
  const rightHandTip = rightHandTarget.clone().add(rightHandTarget.clone().sub(rightElbowPos).normalize().multiplyScalar(0.04 * stature));

  const addJoint = (id: string, name: string, parentId: string | null, pos: THREE.Vector3, color: string) => {
    result.set(id, {
      id,
      name,
      parentId,
      positionModelSpace: [pos.x, pos.y, pos.z],
      userEdited: false,
      source: 'pose-transfer',
      color
    });
  };

  addJoint('pelvis', 'Pelvis', null, pelvisPos, '#38bdf8');
  addJoint('spine', 'Spine', 'pelvis', spinePos, '#38bdf8');
  addJoint('chest', 'Chest', 'spine', chestPos, '#38bdf8');
  addJoint('neck', 'Neck', 'chest', neckPos, '#38bdf8');
  addJoint('head', 'Head', 'neck', headPos, '#38bdf8');

  addJoint('left_shoulder', 'Left_Shoulder', 'chest', leftShoulderPos, '#34d399');
  addJoint('left_elbow', 'Left_Elbow', 'left_shoulder', leftElbowPos, '#34d399');
  addJoint('left_wrist', 'Left_Wrist', 'left_elbow', leftHandTarget, '#34d399');
  addJoint('left_hand', 'Left_Hand', 'left_wrist', leftHandTip, '#34d399');

  addJoint('right_shoulder', 'Right_Shoulder', 'chest', rightShoulderPos, '#f87171');
  addJoint('right_elbow', 'Right_Elbow', 'right_shoulder', rightElbowPos, '#f87171');
  addJoint('right_wrist', 'Right_Wrist', 'right_elbow', rightHandTarget, '#f87171');
  addJoint('right_hand', 'Right_Hand', 'right_wrist', rightHandTip, '#f87171');

  addJoint('left_hip', 'Left_Hip', 'pelvis', leftHipPos, '#34d399');
  addJoint('left_knee', 'Left_Knee', 'left_hip', leftKneePos, '#34d399');
  addJoint('left_ankle', 'Left_Ankle', 'left_knee', leftFootTarget, '#34d399');
  addJoint('left_toe', 'Left_Toe', 'left_ankle', leftToePos, '#34d399');

  addJoint('right_hip', 'Right_Hip', 'pelvis', rightHipPos, '#f87171');
  addJoint('right_knee', 'Right_Knee', 'right_hip', rightKneePos, '#f87171');
  addJoint('right_ankle', 'Right_Ankle', 'right_knee', rightFootTarget, '#f87171');
  addJoint('right_toe', 'Right_Toe', 'right_ankle', rightToePos, '#f87171');

  return result;
}
