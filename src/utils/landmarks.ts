import * as THREE from 'three';
import { JointRecord } from '../types/rig';

export interface LandmarkDot {
  id: string;
  name: string;
  jointId: string;
  badgeNumber: number;
  color: string;
  relativeStature: { y: number; x: number; z: number };
}

/**
 * Standard anatomical landmarks with matching numbers and colors
 * for magnetic landmark snapping.
 */
export const LANDMARK_DEFINITIONS: LandmarkDot[] = [
  { id: 'lm_head', name: 'Head Top', jointId: 'head', badgeNumber: 1, color: '#38bdf8', relativeStature: { y: 0.940, x: 0.0, z: 0.015 } },
  { id: 'lm_neck', name: 'Neck / Throat', jointId: 'neck', badgeNumber: 2, color: '#38bdf8', relativeStature: { y: 0.870, x: 0.0, z: 0.0 } },
  { id: 'lm_chest', name: 'Chest / Sternum', jointId: 'chest', badgeNumber: 3, color: '#38bdf8', relativeStature: { y: 0.720, x: 0.0, z: 0.01 } },
  { id: 'lm_pelvis', name: 'Pelvis / Sacrum', jointId: 'pelvis', badgeNumber: 4, color: '#38bdf8', relativeStature: { y: 0.530, x: 0.0, z: 0.0 } },

  // Left Arm (Emerald)
  { id: 'lm_l_shoulder', name: 'Left Shoulder (Acromion)', jointId: 'left_shoulder', badgeNumber: 5, color: '#34d399', relativeStature: { y: 0.818, x: 0.105, z: -0.005 } },
  { id: 'lm_l_elbow', name: 'Left Elbow (Olecranon)', jointId: 'left_elbow', badgeNumber: 6, color: '#34d399', relativeStature: { y: 0.630, x: 0.260, z: -0.01 } },
  { id: 'lm_l_wrist', name: 'Left Wrist', jointId: 'left_wrist', badgeNumber: 7, color: '#34d399', relativeStature: { y: 0.485, x: 0.410, z: 0.0 } },

  // Right Arm (Coral)
  { id: 'lm_r_shoulder', name: 'Right Shoulder', jointId: 'right_shoulder', badgeNumber: 8, color: '#f87171', relativeStature: { y: 0.818, x: -0.105, z: -0.005 } },
  { id: 'lm_r_elbow', name: 'Right Elbow', jointId: 'right_elbow', badgeNumber: 9, color: '#f87171', relativeStature: { y: 0.630, x: -0.260, z: -0.01 } },
  { id: 'lm_r_wrist', name: 'Right Wrist', jointId: 'right_wrist', badgeNumber: 10, color: '#f87171', relativeStature: { y: 0.485, x: -0.410, z: 0.0 } },

  // Left Leg (Emerald)
  { id: 'lm_l_hip', name: 'Left Hip Joint', jointId: 'left_hip', badgeNumber: 11, color: '#34d399', relativeStature: { y: 0.505, x: 0.065, z: 0.0 } },
  { id: 'lm_l_knee', name: 'Left Kneecap (Patella)', jointId: 'left_knee', badgeNumber: 12, color: '#34d399', relativeStature: { y: 0.285, x: 0.065, z: 0.015 } },
  { id: 'lm_l_ankle', name: 'Left Ankle (Malleolus)', jointId: 'left_ankle', badgeNumber: 13, color: '#34d399', relativeStature: { y: 0.039, x: 0.065, z: -0.01 } },

  // Right Leg (Coral)
  { id: 'lm_r_hip', name: 'Right Hip Joint', jointId: 'right_hip', badgeNumber: 14, color: '#f87171', relativeStature: { y: 0.505, x: -0.065, z: 0.0 } },
  { id: 'lm_r_knee', name: 'Right Kneecap (Patella)', jointId: 'right_knee', badgeNumber: 15, color: '#f87171', relativeStature: { y: 0.285, x: -0.065, z: 0.015 } },
  { id: 'lm_r_ankle', name: 'Right Ankle', jointId: 'right_ankle', badgeNumber: 16, color: '#f87171', relativeStature: { y: 0.039, x: -0.065, z: -0.01 } }
];

export const SNAP_THRESHOLD_DISTANCE = 0.12; // In meters / model space units

/**
 * Checks if a joint is near its paired magnetic landmark and returns snap result.
 */
export function checkMagneticSnap(
  draggedJointId: string,
  currentPos: THREE.Vector3,
  footY: number,
  headY: number
): {
  snapped: boolean;
  targetPos?: THREE.Vector3;
  landmark?: LandmarkDot;
  warning?: string;
} {
  const stature = Math.max(0.1, headY - footY);

  for (const lm of LANDMARK_DEFINITIONS) {
    const lmPos = new THREE.Vector3(
      lm.relativeStature.x * stature,
      footY + lm.relativeStature.y * stature,
      lm.relativeStature.z * stature
    );

    const dist = currentPos.distanceTo(lmPos);
    if (dist < SNAP_THRESHOLD_DISTANCE) {
      if (lm.jointId === draggedJointId) {
        return {
          snapped: true,
          targetPos: lmPos,
          landmark: lm
        };
      } else {
        return {
          snapped: false,
          warning: `⚠️ Wrong Landmark: Cannot snap ${draggedJointId} to Landmark #${lm.badgeNumber} (${lm.name})`
        };
      }
    }
  }

  return { snapped: false };
}
