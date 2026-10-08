import * as THREE from 'three';

export type RigPlacementMode = 'proportional' | 'pose-transfer' | 'manual';
export type RigStage = 'placement' | 'skinning' | 'testing' | 'export';
export type TestAnimationType =
  | 'rest'
  | 'walk'
  | 'intermittent_walk'
  | 'ambient_crowd'
  | 'hands_on_hips'
  | 'wave'
  | 'squat'
  | 'twist'
  | 'robot_servo';

export interface LimbLocks {
  leftArm: boolean;
  rightArm: boolean;
  legs: boolean;
  torso: boolean;
  head: boolean;
}

export interface JointRecord {
  id: string;
  name: string;
  parentId: string | null;
  positionModelSpace: [number, number, number]; // [x, y, z] in model-relative space
  userEdited: boolean;
  source: 'proportional' | 'pose-transfer' | 'manual';
  color?: string;
  radius?: number;
}

export interface BoneHierarchyDef {
  id: string;
  name: string;
  parentId: string | null;
  side: 'center' | 'left' | 'right';
  defaultStatureFraction: {
    y: number; // height fraction 0..1
    xOffset: number; // relative to height
    zOffset: number;
  };
}

export interface IKTarget {
  id: string;
  name: string;
  position: [number, number, number];
  poleVector?: [number, number, number];
}

export interface SavedPose {
  id: string;
  name: string;
  timestamp: number;
  joints: Record<string, [number, number, number]>;
  isCustom?: boolean;
  description?: string;
}

export interface MannequinPoseState {
  pelvis: [number, number, number];
  leftHand: [number, number, number];
  rightHand: [number, number, number];
  leftFoot: [number, number, number];
  rightFoot: [number, number, number];
  head: [number, number, number];
}

export interface RigidPropLock {
  meshUuid: string;
  meshName: string;
  boneId: string;
}

export interface ProjectState {
  asset: {
    id: string;
    name: string;
    sourceRoot: THREE.Group | null;
    workingRoot: THREE.Group | null;
    revision: number;
    height: number;
    boundingBox: THREE.Box3 | null;
  };
  fit: {
    alignmentRoot: THREE.Group | null;
    jointRecords: Map<string, JointRecord>;
    headHeight: number;
    footHeight: number;
    armSpread: number; // 0.0 (Relaxed) to 0.5 (A-pose) to 1.0 (T-pose)
    symmetryEnabled: boolean;
    xrayEnabled: boolean;
  };
  proxy: {
    enabled: boolean;
    scale: number;
    pose: MannequinPoseState;
  };
  skin: {
    isBound: boolean;
    skeleton: THREE.Skeleton | null;
    skinnedMeshes: THREE.SkinnedMesh[];
    boneMap: Map<string, THREE.Bone>;
    rigidProps: RigidPropLock[];
    maxInfluences: number;
    sagittalSeparation: boolean;
  };
  bench: {
    currentAnimation: TestAnimationType;
    isPlaying: boolean;
    speed: number;
    time: number;
  };
}

export interface HistoryCommand {
  description: string;
  before: Map<string, JointRecord>;
  after: Map<string, JointRecord>;
}
