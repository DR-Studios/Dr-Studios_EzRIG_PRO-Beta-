import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  RotateCcw,
  RotateCw,
  Play,
  Pause,
  Download,
  Upload,
  Sparkles,
  Sliders,
  Move,
  Activity,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Box,
  Layers,
  Shield,
  Lock,
  Unlock,
  Compass,
  Repeat,
  Crosshair,
  Bookmark,
  Trash2,
  Plus,
  FileDown,
  Magnet,
  Zap,
  Target
} from 'lucide-react';

import {
  JointRecord,
  RigPlacementMode,
  RigStage,
  TestAnimationType,
  HistoryCommand,
  RigidPropLock,
  LimbLocks,
  SavedPose
} from './types/rig';
import {
  SYMMETRIC_PAIRS,
  computeProportionalSkeleton,
  analyzeModelStature,
  ArmKinematicsOptions
} from './utils/anthropometry';
import {
  MANNEQUIN_PRESETS,
  generatePoseTransferJoints
} from './utils/kinematicIK';
import {
  bindMeshesToSkeleton,
  SkinBindingResult
} from './utils/skinBinding';
import {
  updateProceduralAnimation,
  RobotStickState
} from './utils/proceduralAnims';
import {
  createStylizedHumanoid,
  createCyberFighterWithWeapon
} from './utils/meshGenerators';
import { exportRiggedGLB } from './utils/exporter';
import {
  LANDMARK_DEFINITIONS,
  checkMagneticSnap,
  LandmarkDot
} from './utils/landmarks';
import {
  nudgeJointChain,
  getDescendantJointIds
} from './utils/chainNudge';

export default function App() {
  // --- APPLICATION STATE ---
  const [placementMode, setPlacementMode] = useState<RigPlacementMode>('proportional');
  const [stage, setStage] = useState<RigStage>('placement');
  const [selectedJointId, setSelectedJointId] = useState<string>('pelvis');
  
  // Model & Stature State
  const [modelName, setModelName] = useState<string>('Stylized Mannequin');
  const [headY, setHeadY] = useState<number>(1.80);
  const [footY, setFootY] = useState<number>(0.0);
  
  // Wide-Range Arm Kinematics
  const [armSpread, setArmSpread] = useState<number>(1.0); // -0.2 to 1.4
  const [armPitch, setArmPitch] = useState<number>(0.0);   // -0.5 to 0.6
  const [elbowFlex, setElbowFlex] = useState<number>(0.0); // 0.0 to 1.0
  
  // Controls & Toggles (Mirror symmetry defaulted to TRUE)
  const [symmetryEnabled, setSymmetryEnabled] = useState<boolean>(true);
  const [xrayEnabled, setXrayEnabled] = useState<boolean>(true);
  const [sagittalSeparation, setSagittalSeparation] = useState<boolean>(true);
  const [showStaturePlanes, setShowStaturePlanes] = useState<boolean>(true);
  const [activePosePreset, setActivePosePreset] = useState<string>('a_pose');

  // MAGNETIC DOTS STATE
  const [magneticDotsEnabled, setMagneticDotsEnabled] = useState<boolean>(true);

  // INDEPENDENT ROTATION CONTROLS (Mesh vs Skeleton vs Scene Turntable)
  const [gizmoMode, setGizmoMode] = useState<'translate' | 'rotate'>('translate');
  const [modelMeshRotation, setModelMeshRotation] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const [skeletonRotation, setSkeletonRotation] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const [sceneTurntableDeg, setSceneTurntableDeg] = useState<number>(0);
  const [isTurntableActive, setIsTurntableActive] = useState<boolean>(false);
  const [rotationTab, setRotationTab] = useState<'model' | 'skeleton' | 'both'>('model');

  // NUMERIC INPUT TYPING STRINGS (Fix typing rejection)
  const [inputCoordX, setInputCoordX] = useState<string>('0.000');
  const [inputCoordY, setInputCoordY] = useState<string>('0.950');
  const [inputCoordZ, setInputCoordZ] = useState<string>('0.000');

  // Robotics / Puppeteering / Limb Locks State
  const [limbLocks, setLimbLocks] = useState<LimbLocks>({
    leftArm: false,
    rightArm: false,
    legs: false,
    torso: false,
    head: false
  });
  const [robotSticks, setRobotSticks] = useState<RobotStickState>({
    rightStick: { x: 0, y: 0 },
    leftStick: { x: 0, y: 0 }
  });

  // TEST BENCH SUB-TABS: Motions, Pose Library, Robotic Puppeteer
  const [testBenchSubTab, setTestBenchSubTab] = useState<'motions' | 'library' | 'puppeteer'>('motions');
  const [savedPoses, setSavedPoses] = useState<SavedPose[]>([]);
  const [newPoseNameInput, setNewPoseNameInput] = useState<string>('');

  // Skinning & Animation Bench State
  const [isSkinBound, setIsSkinBound] = useState<boolean>(false);
  const [currentAnimation, setCurrentAnimation] = useState<TestAnimationType>('walk');
  const [isPlayingAnim, setIsPlayingAnim] = useState<boolean>(true);
  const [animSpeed, setAnimSpeed] = useState<number>(1.0);
  const [rigidProps, setRigidProps] = useState<RigidPropLock[]>([]);

  // Feedback, Errors & Modals
  const [toastMessage, setToastMessage] = useState<string>('Welcome to EasyRig Tri-Mode: Ready to rig.');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
  } | null>(null);

  // Undo / Redo Counters
  const [undoCount, setUndoCount] = useState<number>(0);
  const [redoCount, setRedoCount] = useState<number>(0);

  // Authoritative Joint Store & History
  const jointRecordsRef = useRef<Map<string, JointRecord>>(new Map());
  const selectedJointIdRef = useRef<string>(selectedJointId);
  const historyRef = useRef<{ undo: HistoryCommand[]; redo: HistoryCommand[] }>({
    undo: [],
    redo: []
  });

  // Animation & Robotics Refs
  const limbLocksRef = useRef<LimbLocks>(limbLocks);
  const robotSticksRef = useRef<RobotStickState>(robotSticks);
  const isTurntableActiveRef = useRef<boolean>(isTurntableActive);
  const animTimeRef = useRef<number>(0);
  const symmetryEnabledRef = useRef<boolean>(symmetryEnabled);
  const isSkinBoundRef = useRef<boolean>(isSkinBound);
  const isPlayingAnimRef = useRef<boolean>(isPlayingAnim);
  const currentAnimationRef = useRef<TestAnimationType>(currentAnimation);
  const animSpeedRef = useRef<number>(animSpeed);
  const baselineJointsBeforeRotRef = useRef<Map<string, JointRecord> | null>(null);

  // Manual Joint Chain Rotation Slider State
  const [jointRotAxis, setJointRotAxis] = useState<'pitch' | 'yaw' | 'roll'>('pitch');
  const [jointRotSliderVal, setJointRotSliderVal] = useState<number>(0);

  useEffect(() => { selectedJointIdRef.current = selectedJointId; }, [selectedJointId]);
  useEffect(() => { limbLocksRef.current = limbLocks; }, [limbLocks]);
  useEffect(() => { robotSticksRef.current = robotSticks; }, [robotSticks]);
  useEffect(() => { isTurntableActiveRef.current = isTurntableActive; }, [isTurntableActive]);
  useEffect(() => { symmetryEnabledRef.current = symmetryEnabled; }, [symmetryEnabled]);
  useEffect(() => { isSkinBoundRef.current = isSkinBound; }, [isSkinBound]);
  useEffect(() => { isPlayingAnimRef.current = isPlayingAnim; }, [isPlayingAnim]);
  useEffect(() => { currentAnimationRef.current = currentAnimation; }, [currentAnimation]);
  useEffect(() => { animSpeedRef.current = animSpeed; }, [animSpeed]);

  // Three.js Scene References
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const transformRef = useRef<TransformControls | null>(null);

  // Character Pivot & Groups
  const characterPivotRef = useRef<THREE.Group>(new THREE.Group());
  const workingMeshGroupRef = useRef<THREE.Group>(new THREE.Group());
  const visualJointsGroupRef = useRef<THREE.Group>(new THREE.Group());
  const boneLinesGroupRef = useRef<THREE.Group>(new THREE.Group());
  const staturePlanesGroupRef = useRef<THREE.Group>(new THREE.Group());
  const magneticLandmarksGroupRef = useRef<THREE.Group>(new THREE.Group());
  const jointMeshMapRef = useRef<Map<string, THREE.Mesh>>(new Map());

  // Skinned Engine Ref
  const skinBindingResultRef = useRef<SkinBindingResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  // Update input text fields whenever selected joint changes
  useEffect(() => {
    const rec = jointRecordsRef.current.get(selectedJointId);
    if (rec) {
      setInputCoordX(rec.positionModelSpace[0].toFixed(3));
      setInputCoordY(rec.positionModelSpace[1].toFixed(3));
      setInputCoordZ(rec.positionModelSpace[2].toFixed(3));
    }
  }, [selectedJointId]);

  // --- INITIALIZE POSE LIBRARY FROM LOCAL/SESSION STORAGE & SEED PRESETS ---
  useEffect(() => {
    try {
      const stored = localStorage.getItem('easyrig_pose_library') || sessionStorage.getItem('easyrig_pose_library');
      if (stored) {
        const parsed: SavedPose[] = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSavedPoses(parsed);
          return;
        }
      }
    } catch {
      // fallback
    }

    // Comprehensive seed presets
    const seedLibrary: SavedPose[] = [
      { id: 'pose_tpose', name: 'T-Pose (Rest Calibration)', timestamp: Date.now() - 3600000, description: 'Orthogonal horizontal arm calibration (0°)', joints: {} },
      { id: 'pose_apose', name: 'A-Pose (Standard 45°)', timestamp: Date.now() - 3000000, description: 'Natural posture with arms angled at 45°', joints: {} },
      { id: 'pose_relaxed', name: 'Relaxed Stand', timestamp: Date.now() - 2800000, description: 'Natural relaxed standing arms along sides', joints: {} },
      { id: 'pose_akimbo', name: 'Hands Touching Hips (Akimbo)', timestamp: Date.now() - 2400000, description: 'Statuesque hero pose with hands placed on hips', joints: {} },
      { id: 'pose_combat_crouch', name: 'Deep Combat Crouch', timestamp: Date.now() - 1800000, description: 'Low center of gravity with knee and hip flexion', joints: {} },
      { id: 'pose_hero_lunge', name: 'Hero Action Lunge', timestamp: Date.now() - 1200000, description: 'Dynamic forward weight shift and raised guard', joints: {} },
      { id: 'pose_seated', name: 'Seated on Stool', timestamp: Date.now() - 800000, description: '90-degree hip and knee bend seated posture', joints: {} },
      { id: 'pose_forward_bend', name: 'Forward Bend / Touch Toes', timestamp: Date.now() - 400000, description: 'Deep torso flexion reaching towards ankles', joints: {} }
    ];
    setSavedPoses(seedLibrary);
  }, []);

  // Save poses to storage
  const persistPoses = (poses: SavedPose[]) => {
    setSavedPoses(poses);
    try {
      localStorage.setItem('easyrig_pose_library', JSON.stringify(poses));
      sessionStorage.setItem('easyrig_pose_library', JSON.stringify(poses));
    } catch {
      // ignore
    }
  };

  // --- HISTORY & UNDO/REDO ---
  const snapshotJoints = useCallback((): Map<string, JointRecord> => {
    const snap = new Map<string, JointRecord>();
    for (const [k, v] of jointRecordsRef.current.entries()) {
      snap.set(k, { ...v, positionModelSpace: [...v.positionModelSpace] });
    }
    return snap;
  }, []);

  const pushHistorySnapshot = useCallback((description: string) => {
    const before = snapshotJoints();
    return (after: Map<string, JointRecord>) => {
      historyRef.current.undo.push({ description, before, after });
      if (historyRef.current.undo.length > 40) historyRef.current.undo.shift();
      historyRef.current.redo = [];
      setUndoCount(historyRef.current.undo.length);
      setRedoCount(0);
    };
  }, [snapshotJoints]);

  const executeUndo = useCallback(() => {
    if (historyRef.current.undo.length === 0) return;
    const cmd = historyRef.current.undo.pop()!;
    historyRef.current.redo.push({
      description: cmd.description,
      before: snapshotJoints(),
      after: cmd.before
    });
    jointRecordsRef.current = cmd.before;
    setUndoCount(historyRef.current.undo.length);
    setRedoCount(historyRef.current.redo.length);
    syncVisualMarkersFromStore();
    notify(`Undo: ${cmd.description}`);
  }, [snapshotJoints, notify]);

  const executeRedo = useCallback(() => {
    if (historyRef.current.redo.length === 0) return;
    const cmd = historyRef.current.redo.pop()!;
    historyRef.current.undo.push({
      description: cmd.description,
      before: snapshotJoints(),
      after: cmd.after
    });
    jointRecordsRef.current = cmd.after;
    setUndoCount(historyRef.current.undo.length);
    setRedoCount(historyRef.current.redo.length);
    syncVisualMarkersFromStore();
    notify(`Redo: ${cmd.description}`);
  }, [snapshotJoints, notify]);

  // --- UPDATE VISUAL MARKERS & REATTACH TRANSFORM CONTROLS ---
  const syncVisualMarkersFromStore = useCallback(() => {
    const group = visualJointsGroupRef.current;
    const meshMap = jointMeshMapRef.current;

    for (const [id, record] of jointRecordsRef.current.entries()) {
      let mesh = meshMap.get(id);
      if (!mesh) {
        // Main sphere
        const geo = new THREE.SphereGeometry(0.026, 18, 18);
        const col = record.id.startsWith('left') ? 0x34d399 : record.id.startsWith('right') ? 0xf87171 : 0x38bdf8;
        const mat = new THREE.MeshStandardMaterial({
          color: col,
          roughness: 0.3,
          metalness: 0.2,
          depthTest: !xrayEnabled
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.userData = { jointId: id };

        // Invisible pick sphere (generous hit target: radius 0.065) for 100% reliable clicking!
        const hitPickGeo = new THREE.SphereGeometry(0.065, 12, 12);
        const hitPickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
        const hitPickMesh = new THREE.Mesh(hitPickGeo, hitPickMat);
        hitPickMesh.userData = { jointId: id, isPickProxy: true };
        mesh.add(hitPickMesh);

        group.add(mesh);
        meshMap.set(id, mesh);
      }

      mesh.position.set(...record.positionModelSpace);
      mesh.renderOrder = xrayEnabled ? 999 : 0;

      const mat = mesh.material as THREE.MeshStandardMaterial;
      const isSelected = id === selectedJointIdRef.current;
      mat.depthTest = !xrayEnabled;

      if (isSelected) {
        mat.color.setHex(0xf59e0b);
        mat.emissive.setHex(0xd97706);
        mat.emissiveIntensity = 0.9;
        mesh.scale.setScalar(1.25);
      } else if (record.userEdited) {
        mat.color.setHex(0xfbbf24);
        mat.emissive.setHex(0x78350f);
        mat.emissiveIntensity = 0.3;
        mesh.scale.setScalar(1.05);
      } else {
        const baseCol = record.id.startsWith('left') ? 0x34d399 : record.id.startsWith('right') ? 0xf87171 : 0x38bdf8;
        mat.color.setHex(baseCol);
        mat.emissive.setHex(0x0f172a);
        mat.emissiveIntensity = 0.1;
        mesh.scale.setScalar(1.0);
      }
    }

    // Update Bone Lines
    const linesGroup = boneLinesGroupRef.current;
    while (linesGroup.children.length > 0) {
      const child = linesGroup.children[0];
      linesGroup.remove(child);
      if ((child as THREE.Line).geometry) (child as THREE.Line).geometry.dispose();
    }

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: xrayEnabled ? 0.85 : 0.5,
      depthTest: !xrayEnabled
    });

    for (const [id, record] of jointRecordsRef.current.entries()) {
      if (record.parentId && jointRecordsRef.current.has(record.parentId)) {
        const parentRec = jointRecordsRef.current.get(record.parentId)!;
        const p1 = new THREE.Vector3(...record.positionModelSpace);
        const p2 = new THREE.Vector3(...parentRec.positionModelSpace);
        const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const line = new THREE.Line(geo, lineMat);
        line.renderOrder = xrayEnabled ? 998 : 0;
        linesGroup.add(line);
      }
    }

    // Reattach transform controls STRICTLY to the selected joint marker
    if (transformRef.current) {
      const selMesh = meshMap.get(selectedJointIdRef.current);
      if (selMesh) {
        transformRef.current.attach(selMesh);
      } else {
        transformRef.current.detach();
      }
    }
  }, [xrayEnabled]);

  const updateBoneLinesOnly = useCallback(() => {
    const linesGroup = boneLinesGroupRef.current;
    while (linesGroup.children.length > 0) {
      const child = linesGroup.children[0];
      linesGroup.remove(child);
      if ((child as THREE.Line).geometry) (child as THREE.Line).geometry.dispose();
    }

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: xrayEnabled ? 0.85 : 0.5,
      depthTest: !xrayEnabled
    });

    for (const [id, record] of jointRecordsRef.current.entries()) {
      if (record.parentId && jointRecordsRef.current.has(record.parentId)) {
        const parentRec = jointRecordsRef.current.get(record.parentId)!;
        const p1 = new THREE.Vector3(...record.positionModelSpace);
        const p2 = new THREE.Vector3(...parentRec.positionModelSpace);
        const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const line = new THREE.Line(geo, lineMat);
        line.renderOrder = xrayEnabled ? 998 : 0;
        linesGroup.add(line);
      }
    }
  }, [xrayEnabled]);

  // Update TransformControls Gizmo Mode
  useEffect(() => {
    if (transformRef.current) {
      transformRef.current.setMode(gizmoMode);
    }
  }, [gizmoMode]);

  // --- MAGNETIC LANDMARKS VISUAL BEACONS ---
  const updateMagneticLandmarkBeacons = useCallback(() => {
    const group = magneticLandmarksGroupRef.current;
    while (group.children.length > 0) {
      const c = group.children[0];
      group.remove(c);
      if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose();
    }

    if (!magneticDotsEnabled) return;

    const stature = Math.max(0.1, headY - footY);

    for (const lm of LANDMARK_DEFINITIONS) {
      const pos = new THREE.Vector3(
        lm.relativeStature.x * stature,
        footY + lm.relativeStature.y * stature,
        lm.relativeStature.z * stature
      );

      // Landmark beacon ring
      const ringGeo = new THREE.RingGeometry(0.032, 0.040, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(lm.color),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(pos);
      ringMesh.lookAt(pos.clone().add(new THREE.Vector3(0, 0, 1)));
      ringMesh.renderOrder = 1000;

      // Inner dot
      const dotGeo = new THREE.SphereGeometry(0.012, 12, 12);
      const dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(lm.color) });
      const dotMesh = new THREE.Mesh(dotGeo, dotMat);
      dotMesh.position.copy(pos);
      dotMesh.renderOrder = 1000;

      group.add(ringMesh);
      group.add(dotMesh);
    }
  }, [magneticDotsEnabled, headY, footY]);

  // Snap all joints to magnetic landmarks (1-click auto-align)
  const handleSnapAllToLandmarks = useCallback(() => {
    const commit = pushHistorySnapshot('Magnetic Snap All Joints');
    const stature = Math.max(0.1, headY - footY);

    for (const lm of LANDMARK_DEFINITIONS) {
      const rec = jointRecordsRef.current.get(lm.jointId);
      if (rec) {
        rec.positionModelSpace = [
          lm.relativeStature.x * stature,
          footY + lm.relativeStature.y * stature,
          lm.relativeStature.z * stature
        ];
        rec.userEdited = true;
        rec.source = 'manual';
      }
    }

    commit(snapshotJoints());
    syncVisualMarkersFromStore();
    notify('🧲 Snapped all joints to their paired anatomical landmark beacons!');
  }, [headY, footY, pushHistorySnapshot, snapshotJoints, syncVisualMarkersFromStore, notify]);

  // --- STATURE REFERENCE PLANES ---
  const updateStaturePlanes = useCallback(() => {
    const planesGroup = staturePlanesGroupRef.current;
    while (planesGroup.children.length > 0) {
      const c = planesGroup.children[0];
      planesGroup.remove(c);
      if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose();
    }

    if (!showStaturePlanes) return;

    const headPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.8),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    headPlane.rotation.x = Math.PI / 2;
    headPlane.position.set(0, headY, 0);
    planesGroup.add(headPlane);

    const footPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.8),
      new THREE.MeshBasicMaterial({ color: 0x34d399, wireframe: true, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    footPlane.rotation.x = Math.PI / 2;
    footPlane.position.set(0, footY, 0);
    planesGroup.add(footPlane);
  }, [showStaturePlanes, headY, footY]);

  // --- INDEPENDENT MODEL MESH ROTATION ---
  const rotateModelMesh = useCallback((axis: 'x' | 'y' | 'z', deltaDeg: number) => {
    setModelMeshRotation(prev => {
      const updated = {
        ...prev,
        [axis]: (prev[axis] + deltaDeg) % 360
      };
      const rx = THREE.MathUtils.degToRad(updated.x);
      const ry = THREE.MathUtils.degToRad(updated.y);
      const rz = THREE.MathUtils.degToRad(updated.z);
      workingMeshGroupRef.current.rotation.set(rx, ry, rz);

      const stature = analyzeModelStature(workingMeshGroupRef.current);
      setFootY(stature.minY);
      setHeadY(stature.maxY);

      notify(`Rotated 3D Model Mesh ${axis.toUpperCase()} by ${deltaDeg > 0 ? '+' : ''}${deltaDeg}° (Skeleton remained in place)`);
      return updated;
    });
  }, [notify]);

  const resetModelMeshRotation = useCallback(() => {
    setModelMeshRotation({ x: 0, y: 0, z: 0 });
    workingMeshGroupRef.current.rotation.set(0, 0, 0);
    const stature = analyzeModelStature(workingMeshGroupRef.current);
    setFootY(stature.minY);
    setHeadY(stature.maxY);
    notify('Reset Model Mesh rotation to 0°. Skeleton remained in place.');
  }, [notify]);

  // --- RECALCULATE PROPORTIONS (MODE 1) ---
  const applyProportionalFit = useCallback((
    armOpts: ArmKinematicsOptions = { spread: armSpread, pitch: armPitch, elbowFlex },
    preserveEdited: boolean = true
  ) => {
    const commitHistory = pushHistorySnapshot('Proportional Skeleton Fit');
    const newRecords = computeProportionalSkeleton(
      footY,
      headY,
      armOpts,
      preserveEdited,
      jointRecordsRef.current
    );
    jointRecordsRef.current = newRecords;
    commitHistory(newRecords);
    syncVisualMarkersFromStore();
    notify(`Proportional skeleton aligned to stature [${(headY - footY).toFixed(2)}m]`);
  }, [footY, headY, armSpread, armPitch, elbowFlex, pushHistorySnapshot, syncVisualMarkersFromStore, notify]);

  const setPostureHandsOnHips = useCallback(() => {
    setArmSpread(-0.2);
    setArmPitch(0.1);
    setElbowFlex(0.85);
    applyProportionalFit({ spread: -0.2, pitch: 0.1, elbowFlex: 0.85, handsTouchingHips: true }, false);
    notify('Applied posture: Hands Touching Hips (Akimbo)');
  }, [applyProportionalFit, notify]);

  // --- INDEPENDENT SKELETON ROTATION (X, Y, Z WITH FULL UNDO) ---
  const rotateSkeleton = useCallback((axis: 'x' | 'y' | 'z', deltaDeg: number) => {
    const commit = pushHistorySnapshot(`Rotate Skeleton ${axis.toUpperCase()} ${deltaDeg}°`);
    const rad = THREE.MathUtils.degToRad(deltaDeg);
    const centerY = (headY + footY) / 2;
    const rotEuler = new THREE.Euler(
      axis === 'x' ? rad : 0,
      axis === 'y' ? rad : 0,
      axis === 'z' ? rad : 0,
      'XYZ'
    );
    const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(rotEuler);

    for (const rec of jointRecordsRef.current.values()) {
      const v = new THREE.Vector3(
        rec.positionModelSpace[0],
        rec.positionModelSpace[1] - centerY,
        rec.positionModelSpace[2]
      );
      v.applyMatrix4(rotMatrix);
      rec.positionModelSpace = [v.x, v.y + centerY, v.z];
      rec.userEdited = true;
      rec.source = 'manual';
    }

    setSkeletonRotation(prev => ({
      ...prev,
      [axis]: (prev[axis] + deltaDeg) % 360
    }));

    commit(snapshotJoints());
    syncVisualMarkersFromStore();
    notify(`Rotated Skeleton ${axis.toUpperCase()} by ${deltaDeg > 0 ? '+' : ''}${deltaDeg}° (Model Mesh remained in place)`);
  }, [headY, footY, pushHistorySnapshot, snapshotJoints, syncVisualMarkersFromStore, notify]);

  const resetSkeletonRotation = useCallback(() => {
    applyProportionalFit({ spread: armSpread, pitch: armPitch, elbowFlex }, false);
    setSkeletonRotation({ x: 0, y: 0, z: 0 });
    notify('Reset Skeleton to default aligned orientation');
  }, [applyProportionalFit, armSpread, armPitch, elbowFlex, notify]);

  // --- COUPLED CHARACTER ROTATION (BOTH MODEL & SKELETON) ---
  const rotateBothTogether = useCallback((axis: 'x' | 'y', deltaDeg: number) => {
    if (axis === 'y') {
      characterPivotRef.current.rotation.y += THREE.MathUtils.degToRad(deltaDeg);
      setSceneTurntableDeg(prev => (prev + deltaDeg) % 360);
      notify(`Rotated character (model + skeleton) Y by ${deltaDeg > 0 ? '+' : ''}${deltaDeg}°`);
    } else if (axis === 'x') {
      characterPivotRef.current.rotation.x += THREE.MathUtils.degToRad(deltaDeg);
      notify(`Tilted character (model + skeleton) X by ${deltaDeg > 0 ? '+' : ''}${deltaDeg}°`);
    }
  }, [notify]);

  const resetBothRotation = useCallback(() => {
    characterPivotRef.current.rotation.set(0, 0, 0);
    setSceneTurntableDeg(0);
    notify('Reset character view rotation to default');
  }, [notify]);

  // --- CENTER & GROUND IMPORTED MODEL ---
  const handleCenterModelMesh = useCallback(() => {
    const stature = analyzeModelStature(workingMeshGroupRef.current);
    workingMeshGroupRef.current.position.x -= stature.center.x;
    workingMeshGroupRef.current.position.z -= stature.center.z;
    workingMeshGroupRef.current.position.y -= stature.minY;
    const newStature = analyzeModelStature(workingMeshGroupRef.current);
    setFootY(newStature.minY);
    setHeadY(newStature.maxY);
    applyProportionalFit({ spread: armSpread, pitch: armPitch, elbowFlex }, false);
    notify(`Centered and grounded model: stature ${(newStature.maxY - newStature.minY).toFixed(2)}m`);
  }, [applyProportionalFit, armSpread, armPitch, elbowFlex, notify]);

  const requestProportionalRecalculate = useCallback((forceOverwrite: boolean = false) => {
    let hasUserEdited = false;
    for (const rec of jointRecordsRef.current.values()) {
      if (rec.userEdited) {
        hasUserEdited = true;
        break;
      }
    }

    if (hasUserEdited && !forceOverwrite) {
      setConfirmDialog({
        isOpen: true,
        title: 'Overwrite Manual Joint Edits?',
        message: 'You have customized joint locations. Recalculate all joints or keep manual edits intact?',
        confirmText: 'Overwrite All',
        onConfirm: () => {
          applyProportionalFit({ spread: armSpread, pitch: armPitch, elbowFlex }, false);
          setConfirmDialog(null);
        }
      });
    } else {
      applyProportionalFit({ spread: armSpread, pitch: armPitch, elbowFlex }, !forceOverwrite);
    }
  }, [applyProportionalFit, armSpread, armPitch, elbowFlex]);

  // --- KINEMATIC POSE TRANSFER (MODE 2 WITH GENUINE CONFIRMATION) ---
  const requestPoseTransferWithConfirmation = useCallback((presetKey: string) => {
    const presetName = MANNEQUIN_PRESETS[presetKey]?.name || presetKey;
    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Kinematic Pose Transfer',
      message: `Transfer the mannequin pose '${presetName}' onto your character? This will map joint landmarks while preserving intrinsic bone chain lengths.`,
      confirmText: 'Transfer Pose',
      onConfirm: () => {
        const commitHistory = pushHistorySnapshot(`Pose Transfer: ${presetKey}`);
        const newRecords = generatePoseTransferJoints(presetKey, footY, headY);
        jointRecordsRef.current = newRecords;
        commitHistory(newRecords);
        setActivePosePreset(presetKey);
        syncVisualMarkersFromStore();
        setConfirmDialog(null);
        notify(`✓ Transferred pose '${presetName}' onto model with bone length preservation.`);
      }
    });
  }, [footY, headY, pushHistorySnapshot, syncVisualMarkersFromStore, notify]);

  // --- NUDGE JOINT CHAIN PANEL ACTION (MODE 3 FEATURE) ---
  const handleNudgeChain = useCallback((pitchDeg: number, yawDeg: number, rollDeg: number) => {
    const commit = pushHistorySnapshot(`Nudge Chain ${selectedJointId} [${pitchDeg}°, ${yawDeg}°, ${rollDeg}°]`);
    const newRecords = nudgeJointChain(
      selectedJointId,
      { pitchDeg, yawDeg, rollDeg },
      jointRecordsRef.current,
      symmetryEnabled
    );
    jointRecordsRef.current = newRecords;
    commit(newRecords);
    syncVisualMarkersFromStore();
    notify(`Nudged joint chain at ${selectedJointId} by [P:${pitchDeg}°, Y:${yawDeg}°, R:${rollDeg}°]`);
  }, [selectedJointId, symmetryEnabled, pushHistorySnapshot, syncVisualMarkersFromStore, notify]);

  // --- POSE LIBRARY FUNCTIONS (LOCAL & SESSION PERSISTENCE) ---
  const handleSaveCurrentPose = useCallback(() => {
    const name = newPoseNameInput.trim() || `Custom Pose #${savedPoses.length + 1}`;
    const jointsObj: Record<string, [number, number, number]> = {};

    for (const [id, rec] of jointRecordsRef.current.entries()) {
      jointsObj[id] = [...rec.positionModelSpace];
    }

    const newPose: SavedPose = {
      id: `pose_${Date.now()}`,
      name,
      timestamp: Date.now(),
      description: `User-saved pose with ${Object.keys(jointsObj).length} articulated joints`,
      joints: jointsObj,
      isCustom: true
    };

    const updated = [newPose, ...savedPoses];
    persistPoses(updated);
    setNewPoseNameInput('');
    notify(`Saved pose "${name}" to Pose Library.`);
  }, [newPoseNameInput, savedPoses, notify]);

  const handleApplySavedPose = useCallback((pose: SavedPose) => {
    const commit = pushHistorySnapshot(`Apply Pose: ${pose.name}`);

    // If it's a seed preset without baked coordinates, calculate dynamically
    if (Object.keys(pose.joints).length === 0) {
      if (pose.id === 'pose_tpose') {
        applyProportionalFit({ spread: 1.0, pitch: 0, elbowFlex: 0 }, false);
      } else if (pose.id === 'pose_apose') {
        applyProportionalFit({ spread: 0.5, pitch: 0, elbowFlex: 0 }, false);
      } else if (pose.id === 'pose_relaxed') {
        applyProportionalFit({ spread: 0.0, pitch: 0, elbowFlex: 0 }, false);
      } else if (pose.id === 'pose_akimbo') {
        setPostureHandsOnHips();
      } else if (pose.id === 'pose_combat_crouch') {
        const newRecords = generatePoseTransferJoints('crouched', footY, headY);
        jointRecordsRef.current = newRecords;
        commit(newRecords);
        syncVisualMarkersFromStore();
      } else if (pose.id === 'pose_hero_lunge') {
        const newRecords = generatePoseTransferJoints('hero_stance', footY, headY);
        jointRecordsRef.current = newRecords;
        commit(newRecords);
        syncVisualMarkersFromStore();
      } else if (pose.id === 'pose_seated') {
        const newRecords = generatePoseTransferJoints('seated', footY, headY);
        jointRecordsRef.current = newRecords;
        commit(newRecords);
        syncVisualMarkersFromStore();
      } else if (pose.id === 'pose_forward_bend') {
        handleNudgeChain(45, 0, 0);
      }
    } else {
      for (const [id, coords] of Object.entries(pose.joints)) {
        const rec = jointRecordsRef.current.get(id);
        if (rec) {
          rec.positionModelSpace = [...coords];
          rec.userEdited = true;
          rec.source = 'manual';
        }
      }
      commit(snapshotJoints());
      syncVisualMarkersFromStore();
    }

    // Re-bind skin if already bound so character mesh deforms to pose immediately
    if (isSkinBound) {
      try {
        const result = bindMeshesToSkeleton(
          workingMeshGroupRef.current,
          jointRecordsRef.current,
          rigidProps,
          sagittalSeparation
        );
        skinBindingResultRef.current = result;
      } catch (err: unknown) {
        console.warn('Auto skin update on pose load:', err);
      }
    }

    notify(`Applied pose "${pose.name}" (Undoable with Ctrl+Z)`);
  }, [applyProportionalFit, setPostureHandsOnHips, handleNudgeChain, footY, headY, pushHistorySnapshot, snapshotJoints, syncVisualMarkersFromStore, isSkinBound, rigidProps, sagittalSeparation, notify]);

  const handleDeleteSavedPose = useCallback((poseId: string) => {
    const updated = savedPoses.filter(p => p.id !== poseId);
    persistPoses(updated);
    notify('Deleted pose from library.');
  }, [savedPoses, notify]);

  const handleExportPoseLibrary = useCallback(() => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(savedPoses, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', 'EasyRig_Pose_Library.json');
    dlAnchor.click();
    notify('Exported Pose Library JSON.');
  }, [savedPoses, notify]);

  const handleImportPoseLibrary = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          persistPoses([...parsed, ...savedPoses]);
          notify(`Imported ${parsed.length} poses into library.`);
        }
      } catch (err: unknown) {
        const error = err as Error;
        setErrorMessage(`Failed to import pose JSON: ${error.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [savedPoses, notify]);

  // --- SKIN BINDING STAGE ---
  const handleBindSkin = useCallback(() => {
    try {
      notify('Binding skin with Sagittal Plane Separation...');
      const result = bindMeshesToSkeleton(
        workingMeshGroupRef.current,
        jointRecordsRef.current,
        rigidProps,
        sagittalSeparation
      );
      skinBindingResultRef.current = result;
      setIsSkinBound(true);
      notify(`Skin bound successfully! ${result.skinnedMeshes.length} meshes skinned with top-4 normalized influences.`);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMessage(`Skin binding error: ${error.message}`);
      notify('Failed to bind skin');
    }
  }, [rigidProps, sagittalSeparation, notify]);

  // --- AUTO RIG PIPELINE (ONE-CLICK) ---
  const handleAutoRigEverything = useCallback(() => {
    if (workingMeshGroupRef.current.children.length === 0) {
      notify('No model loaded. Opening file picker...');
      fileInputRef.current?.click();
      return;
    }
    applyProportionalFit({ spread: armSpread, pitch: armPitch, elbowFlex }, false);
    handleBindSkin();
    setStage('testing');
    notify('⚡ Full Rigging Pipeline Completed: Proportional fit + Skin bound.');
  }, [armSpread, armPitch, elbowFlex, applyProportionalFit, handleBindSkin, notify]);

  // --- GLB EXPORT ---
  const handleExportGLB = useCallback(async () => {
    if (!isSkinBound) {
      handleBindSkin();
    }
    try {
      notify('Preparing GLB export with embedded skeleton hierarchy...');
      await exportRiggedGLB(workingMeshGroupRef.current, `${modelName.replace(/\s+/g, '_')}_Rigged.glb`);
      notify('GLB export completed! Download started.');
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMessage(`GLB Export failed: ${error.message}`);
      notify('Export failed');
    }
  }, [isSkinBound, handleBindSkin, modelName, notify]);

  // --- LOAD SAMPLE MODELS ---
  const loadHumanoidSample = useCallback(() => {
    workingMeshGroupRef.current.clear();
    resetModelMeshRotation();
    const model = createStylizedHumanoid();
    workingMeshGroupRef.current.add(model);
    setModelName('Stylized Mannequin');
    const stature = analyzeModelStature(model);
    setFootY(stature.minY);
    setHeadY(stature.maxY);
    setIsSkinBound(false);
    setRigidProps([]);
    applyProportionalFit({ spread: 1.0, pitch: 0, elbowFlex: 0 }, false);
    notify('Loaded Stylized Mannequin with smooth ball joint articulators');
  }, [resetModelMeshRotation, applyProportionalFit, notify]);

  const loadCyberFighterSample = useCallback(() => {
    workingMeshGroupRef.current.clear();
    resetModelMeshRotation();
    const { group, weaponMesh } = createCyberFighterWithWeapon();
    workingMeshGroupRef.current.add(group);
    setModelName('Cyber Fighter (With Weapon)');
    const stature = analyzeModelStature(group);
    setFootY(stature.minY);
    setHeadY(stature.maxY);
    setIsSkinBound(false);
    setRigidProps([
      { meshUuid: weaponMesh.uuid, meshName: weaponMesh.name, boneId: 'right_wrist' }
    ]);
    applyProportionalFit({ spread: 1.0, pitch: 0, elbowFlex: 0 }, false);
    notify('Loaded Cyber Fighter with Rigid Prop Katana locked to Right Hand');
  }, [resetModelMeshRotation, applyProportionalFit, notify]);

  // --- FILE UPLOAD (PROVISIONAL LOAD WITH SAFE RETENTION) ---
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    notify(`Loading provisional model '${file.name}'...`);
    const reader = new FileReader();

    reader.onload = (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      const loader = new GLTFLoader();

      loader.parse(
        arrayBuffer,
        '',
        (gltf) => {
          workingMeshGroupRef.current.clear();
          resetModelMeshRotation();
          workingMeshGroupRef.current.add(gltf.scene);
          setModelName(file.name.replace(/\.[^/.]+$/, ''));
          setIsSkinBound(false);
          setErrorMessage(null);

          const stature = analyzeModelStature(gltf.scene);
          setFootY(stature.minY);
          setHeadY(stature.maxY);

          if (orbitRef.current) {
            orbitRef.current.target.copy(stature.center);
            orbitRef.current.update();
          }

          applyProportionalFit({ spread: 1.0, pitch: 0, elbowFlex: 0 }, false);
          notify(`Successfully loaded '${file.name}' (${stature.height.toFixed(2)}m stature).`);
        },
        (error) => {
          setErrorMessage(`Invalid or corrupted 3D model file: ${error.message}. Existing model and joints retained.`);
          notify('⚠️ File parse error: previous model retained');
        }
      );
    };

    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }, [resetModelMeshRotation, applyProportionalFit, notify]);

  // --- INITIALIZE THREE.JS SCENE ---
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.05, 50);
    camera.position.set(0, 1.2, 3.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 0.9, 0);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.05;
    orbitRef.current = orbit;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.size = 0.65;
    const gizmo = typeof transform.getHelper === 'function' ? transform.getHelper() : (transform as unknown as THREE.Object3D);
    scene.add(gizmo);
    transformRef.current = transform;

    let preDragSnapshot: Map<string, JointRecord> | null = null;

    transform.addEventListener('dragging-changed', (event) => {
      orbit.enabled = !event.value;
      if (event.value) {
        preDragSnapshot = snapshotJoints();
      } else if (preDragSnapshot) {
        const afterSnap = snapshotJoints();
        historyRef.current.undo.push({
          description: `Move ${selectedJointIdRef.current}`,
          before: preDragSnapshot,
          after: afterSnap
        });
        historyRef.current.redo = [];
        setUndoCount(historyRef.current.undo.length);
        setRedoCount(0);
        preDragSnapshot = null;
      }
    });

    // DRAG CHANGE LISTENER (WITH MAGNETIC SNAP CHECK & STRICT SELECTED JOINT TARGETING)
    transform.addEventListener('change', () => {
      if (transform.object && transform.dragging) {
        const id = selectedJointIdRef.current; // Strictly target selected joint!
        const marker = jointMeshMapRef.current.get(id);
        const record = jointRecordsRef.current.get(id);

        if (marker && record) {
          // Check magnetic landmark snap if enabled
          if (magneticDotsEnabled) {
            const snapResult = checkMagneticSnap(id, marker.position, footY, headY);
            if (snapResult.snapped && snapResult.targetPos) {
              marker.position.copy(snapResult.targetPos);
              notify(`🧲 Snapped ${record.name} to Landmark #${snapResult.landmark?.badgeNumber} (${snapResult.landmark?.name})!`);
            } else if (snapResult.warning) {
              notify(snapResult.warning);
            }
          }

          record.positionModelSpace = [marker.position.x, marker.position.y, marker.position.z];
          record.userEdited = true;
          record.source = 'manual';

          // Update numeric input string display
          setInputCoordX(marker.position.x.toFixed(3));
          setInputCoordY(marker.position.y.toFixed(3));
          setInputCoordZ(marker.position.z.toFixed(3));

          // Mirror Symmetry (strictly respects symmetryEnabledRef)
          if (symmetryEnabledRef.current) {
            if (id.startsWith('left_') || id.startsWith('right_')) {
              const pairId = SYMMETRIC_PAIRS[id];
              if (pairId && jointRecordsRef.current.has(pairId)) {
                const pairRecord = jointRecordsRef.current.get(pairId)!;
                pairRecord.positionModelSpace = [-marker.position.x, marker.position.y, marker.position.z];
                pairRecord.userEdited = true;
                pairRecord.source = 'manual';

                const pairMesh = jointMeshMapRef.current.get(pairId);
                if (pairMesh) {
                  pairMesh.position.set(-marker.position.x, marker.position.y, marker.position.z);
                }
              }
            } else {
              marker.position.x = 0;
              record.positionModelSpace[0] = 0;
            }
          }

          syncVisualMarkersFromStore();
        }
      }
    });

    // Lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 0.7);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(3, 5, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.5);
    fillLight.position.set(-3, 2, -3);
    scene.add(fillLight);

    const grid = new THREE.GridHelper(10, 20, 0x38bdf8, 0x1e293b);
    scene.add(grid);

    // Hierarchical Assembly
    const pivot = characterPivotRef.current;
    scene.add(pivot);
    pivot.add(workingMeshGroupRef.current);
    pivot.add(visualJointsGroupRef.current);
    pivot.add(boneLinesGroupRef.current);
    pivot.add(magneticLandmarksGroupRef.current);
    scene.add(staturePlanesGroupRef.current);

    // Initial Humanoid Model
    const initialHumanoid = createStylizedHumanoid();
    workingMeshGroupRef.current.add(initialHumanoid);

    // Initial Proportions
    const initialRecords = computeProportionalSkeleton(0.0, 1.80, 1.0, false);
    jointRecordsRef.current = initialRecords;
    syncVisualMarkersFromStore();
    updateStaturePlanes();
    updateMagneticLandmarkBeacons();

    // VIEWPORT CLICK SELECTION (ROBUST POINTERUP RAYCASTING ON CANVAS)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let wasDraggingGizmo = false;

    const handlePointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      wasDraggingGizmo = Boolean(transform.dragging);
    };

    const handlePointerUp = (e: PointerEvent) => {
      // Only process as joint selection click if pointer didn't drag to orbit (< 6px movement)
      // and user wasn't dragging the TransformControls gizmo
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6 || wasDraggingGizmo) {
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      const pickCandidates: THREE.Object3D[] = [];
      jointMeshMapRef.current.forEach((m) => {
        pickCandidates.push(m);
      });

      const intersects = raycaster.intersectObjects(pickCandidates, true);
      if (intersects.length > 0) {
        for (const hit of intersects) {
          let curr: THREE.Object3D | null = hit.object;
          while (curr && !curr.userData?.jointId && curr.parent) {
            curr = curr.parent;
          }
          if (curr?.userData?.jointId) {
            const hitId = curr.userData.jointId;
            setSelectedJointId(hitId);
            const r = jointRecordsRef.current.get(hitId);
            if (r) {
              notify(`Selected joint: ${r.name}`);
            }
            break;
          }
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) executeRedo(); else executeUndo();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        executeRedo();
      } else if (e.key.toLowerCase() === 'g') {
        setGizmoMode('translate');
      } else if (e.key.toLowerCase() === 'r') {
        setGizmoMode('rotate');
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Animation Render Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      orbit.update();

      if (isTurntableActiveRef.current) {
        characterPivotRef.current.rotation.y += delta * 0.6;
      }

      if (skinBindingResultRef.current) {
        if (isPlayingAnimRef.current) {
          animTimeRef.current += delta * animSpeedRef.current;
        }
        updateProceduralAnimation(
          skinBindingResultRef.current.boneMap,
          isPlayingAnimRef.current ? currentAnimationRef.current : 'rest',
          animTimeRef.current,
          limbLocksRef.current,
          robotSticksRef.current
        );
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      transform.dispose();
      scene.remove(gizmo);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    syncVisualMarkersFromStore();
  }, [syncVisualMarkersFromStore, xrayEnabled, selectedJointId]);

  useEffect(() => {
    updateStaturePlanes();
  }, [updateStaturePlanes, showStaturePlanes, headY, footY]);

  useEffect(() => {
    updateMagneticLandmarkBeacons();
  }, [updateMagneticLandmarkBeacons, magneticDotsEnabled, headY, footY]);

  const currentJointRecord = jointRecordsRef.current.get(selectedJointId);
  const currentDescendants = getDescendantJointIds(selectedJointId, jointRecordsRef.current);

  // --- SAFE NUMERIC COORDINATE EDITING WITH LIVE UPDATE & TYPING SUPPORT (STRICTLY INDEPENDENT) ---
  const handleNumericCoordinateChange = (axis: 0 | 1 | 2, textVal: string) => {
    if (axis === 0) setInputCoordX(textVal);
    else if (axis === 1) setInputCoordY(textVal);
    else if (axis === 2) setInputCoordZ(textVal);

    const val = parseFloat(textVal);
    if (isNaN(val) || !isFinite(val)) return;

    const rec = jointRecordsRef.current.get(selectedJointId);
    if (!rec) return;

    // Independent: move ONLY the selected joint to that value
    rec.positionModelSpace[axis] = val;
    rec.userEdited = true;
    rec.source = 'manual';

    const mesh = jointMeshMapRef.current.get(selectedJointId);
    if (mesh) {
      if (axis === 0) mesh.position.x = val;
      else if (axis === 1) mesh.position.y = val;
      else if (axis === 2) mesh.position.z = val;
    }

    updateBoneLinesOnly();
  };

  const handleNumericCoordinateCommit = (axis: 0 | 1 | 2) => {
    const rawVal = axis === 0 ? inputCoordX : axis === 1 ? inputCoordY : inputCoordZ;
    const val = parseFloat(rawVal);
    if (!isNaN(val) && isFinite(val)) {
      if (axis === 0) setInputCoordX(val.toFixed(3));
      else if (axis === 1) setInputCoordY(val.toFixed(3));
      else if (axis === 2) setInputCoordZ(val.toFixed(3));

      const rec = jointRecordsRef.current.get(selectedJointId);
      if (rec) {
        rec.positionModelSpace[axis] = val;
        rec.userEdited = true;
        rec.source = 'manual';
      }

      const commit = pushHistorySnapshot(`Edit ${selectedJointId} [${['X', 'Y', 'Z'][axis]}]`);
      commit(snapshotJoints());
      syncVisualMarkersFromStore();
      notify(`Updated ${selectedJointId} [${['X', 'Y', 'Z'][axis]}]: ${val.toFixed(3)}m`);
    }
  };

  const stepCoordinate = (axis: 0 | 1 | 2, delta: number) => {
    const rec = jointRecordsRef.current.get(selectedJointId);
    if (!rec) return;
    const currentVal = rec.positionModelSpace[axis];
    const newVal = parseFloat((currentVal + delta).toFixed(3));
    rec.positionModelSpace[axis] = newVal;
    rec.userEdited = true;
    rec.source = 'manual';

    if (axis === 0) setInputCoordX(newVal.toFixed(3));
    else if (axis === 1) setInputCoordY(newVal.toFixed(3));
    else if (axis === 2) setInputCoordZ(newVal.toFixed(3));

    const mesh = jointMeshMapRef.current.get(selectedJointId);
    if (mesh) {
      if (axis === 0) mesh.position.x = newVal;
      else if (axis === 1) mesh.position.y = newVal;
      else if (axis === 2) mesh.position.z = newVal;
    }

    const commit = pushHistorySnapshot(`Step ${selectedJointId} [${['X', 'Y', 'Z'][axis]}]`);
    commit(snapshotJoints());
    syncVisualMarkersFromStore();
  };

  // --- RESTORED MANUAL ROTATION SLIDER FOR JOINTS & LIMB CHAINS ---
  const handleJointRotSliderChange = (newAngle: number) => {
    setJointRotSliderVal(newAngle);
    if (!baselineJointsBeforeRotRef.current) {
      baselineJointsBeforeRotRef.current = snapshotJoints();
    }
    const angles = {
      pitchDeg: jointRotAxis === 'pitch' ? newAngle : 0,
      yawDeg: jointRotAxis === 'yaw' ? newAngle : 0,
      rollDeg: jointRotAxis === 'roll' ? newAngle : 0,
    };
    const newRecords = nudgeJointChain(
      selectedJointId,
      angles,
      baselineJointsBeforeRotRef.current,
      symmetryEnabledRef.current
    );
    jointRecordsRef.current = newRecords;
    syncVisualMarkersFromStore();
  };

  const handleJointRotSliderCommit = () => {
    if (baselineJointsBeforeRotRef.current) {
      const commit = pushHistorySnapshot(`Rotate ${selectedJointId} [${jointRotAxis.toUpperCase()}: ${jointRotSliderVal}°]`);
      commit(jointRecordsRef.current);
      baselineJointsBeforeRotRef.current = null;
      setJointRotSliderVal(0);
      notify(`Rotated ${currentJointRecord?.name} chain [${jointRotAxis.toUpperCase()}]`);
    }
  };

  const setCameraPreset = (view: 'front' | 'side' | 'top' | 'perspective') => {
    if (!cameraRef.current || !orbitRef.current) return;
    const center = new THREE.Vector3(0, (headY + footY) / 2, 0);
    orbitRef.current.target.copy(center);

    if (view === 'front') {
      cameraRef.current.position.set(0, center.y, 3.2);
    } else if (view === 'side') {
      cameraRef.current.position.set(3.2, center.y, 0);
    } else if (view === 'top') {
      cameraRef.current.position.set(0, center.y + 3.2, 0.01);
    } else {
      cameraRef.current.position.set(1.6, center.y + 0.6, 2.5);
    }
    orbitRef.current.update();
  };

  const handleJoystickMove = (stick: 'left' | 'right', e: React.PointerEvent<HTMLDivElement>) => {
    // If not skin-bound yet, auto-bind skin so puppet articulates immediately
    if (!skinBindingResultRef.current) {
      handleBindSkin();
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = (e.clientX - centerX) / (rect.width / 2);
    const dy = -(e.clientY - centerY) / (rect.height / 2);
    const clampedX = Math.max(-1, Math.min(1, dx));
    const clampedY = Math.max(-1, Math.min(1, dy));

    const nextSticks = {
      ...robotSticksRef.current,
      [stick === 'right' ? 'rightStick' : 'leftStick']: { x: clampedX, y: clampedY }
    };
    robotSticksRef.current = nextSticks;
    setRobotSticks(nextSticks);
  };

  const resetJoysticks = () => {
    setRobotSticks({
      rightStick: { x: 0, y: 0 },
      leftStick: { x: 0, y: 0 }
    });
    notify('Reset virtual sticks to center');
  };

  const toggleAllLimbLocks = (lock: boolean) => {
    setLimbLocks({
      leftArm: lock,
      rightArm: lock,
      legs: lock,
      torso: lock,
      head: lock
    });
    notify(lock ? '🔒 All body parts FROZEN in place' : '🔓 All body parts UNLOCKED');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100 select-none">
      
      {/* 3D WebGL Canvas Layer */}
      <div ref={canvasContainerRef} className="absolute inset-0 z-0 outline-none" />

      {/* TOP HEADER NAVIGATION BAR */}
      <header className="absolute top-0 left-0 right-0 z-20 flex h-14 items-center justify-between border-b border-slate-800/80 bg-slate-900/85 px-4 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-400 font-bold shadow-lg shadow-cyan-500/10">
            <Box className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-white">EasyRig Tri-Mode</span>
              <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-400 border border-cyan-500/30">
                v2.3 Rig Studio
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Magnetic Landmarks, Nudge Chains & Pose Library</p>
          </div>
        </div>

        {/* Rig Mode Switcher (Modes 1, 2, 3 - Correct Dynamic Active Indicator) */}
        <div className="flex items-center space-x-1 rounded-xl bg-slate-950/80 p-1 border border-slate-800">
          <button
            onClick={() => setPlacementMode('proportional')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              placementMode === 'proportional'
                ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            1. Proportional Auto-Rig {placementMode === 'proportional' && <span className="text-[10px] font-bold opacity-90">(Active)</span>}
          </button>

          <button
            onClick={() => setPlacementMode('pose-transfer')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              placementMode === 'pose-transfer'
                ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Move className="w-3.5 h-3.5" />
            2. Kinematic Pose Transfer {placementMode === 'pose-transfer' && <span className="text-[10px] font-bold opacity-90">(Active)</span>}
          </button>

          <button
            onClick={() => setPlacementMode('manual')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              placementMode === 'manual'
                ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            3. Manual Override {placementMode === 'manual' && <span className="text-[10px] font-bold opacity-90">(Active)</span>}
          </button>
        </div>

        {/* Global Action Tools */}
        <div className="flex items-center space-x-2">
          {/* Magnetic Landmarks Toggle */}
          <button
            onClick={() => {
              setMagneticDotsEnabled(!magneticDotsEnabled);
              notify(`Magnetic landmark dots ${!magneticDotsEnabled ? 'Enabled' : 'Disabled'}`);
            }}
            title="Toggle Magnetic Landmark Dots"
            className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 border transition-all ${
              magneticDotsEnabled
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
            Landmarks {magneticDotsEnabled ? 'ON' : 'OFF'}
          </button>

          {/* Quick Turntable */}
          <button
            onClick={() => setIsTurntableActive(!isTurntableActive)}
            title="Continuous 360° turntable spin (view only)"
            className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 border transition-all ${
              isTurntableActive
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <Repeat className={`w-3.5 h-3.5 ${isTurntableActive ? 'animate-spin' : ''}`} />
            Turntable
          </button>

          <button
            onClick={handleAutoRigEverything}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-300 border border-emerald-500/40 transition-all shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            Auto Rig Everything
          </button>

          <button
            onClick={handleExportGLB}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Export .GLB
          </button>

          <a
            href="/EasyRig_TriMode.html"
            download="EasyRig_TriMode.html"
            title="Download complete standalone HTML version"
            className="flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 text-xs text-slate-300 border border-slate-700 transition-all"
          >
            <FileCode className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Standalone HTML</span>
          </a>
        </div>
      </header>

      {/* ERROR BANNER */}
      {errorMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-lg bg-red-950/90 border border-red-500/50 px-4 py-2 text-xs text-red-200 shadow-xl backdrop-blur-md">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="ml-2 text-red-400 hover:text-white font-bold">✕</button>
        </div>
      )}

      {/* GENUINE CONFIRMATION MODAL */}
      {confirmDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-700 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-semibold text-sm text-white">{confirmDialog.title}</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{confirmDialog.message}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md"
              >
                {confirmDialog.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LEFT SIDEBAR: PIPELINE & CONFIGURATIONS */}
      <aside className="absolute left-4 top-18 bottom-4 z-10 w-92 flex flex-col rounded-xl border border-slate-800/80 bg-slate-900/85 p-3.5 backdrop-blur-md overflow-hidden shadow-2xl">
        
        {/* Pipeline Stage Tabs */}
        <div className="mb-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Pipeline Stage</span>
            <span className="text-[10px] text-cyan-400 font-mono">Stage {stage === 'placement' ? '1' : stage === 'skinning' ? '2' : stage === 'testing' ? '3' : '4'} / 4</span>
          </div>
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-950 p-1 border border-slate-800 text-[11px]">
            <button
              onClick={() => setStage('placement')}
              className={`py-1 rounded font-medium transition-all ${
                stage === 'placement'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'text-slate-400 hover:bg-slate-800/60'
              }`}
            >
              1. Joints
            </button>
            <button
              onClick={() => setStage('skinning')}
              className={`py-1 rounded font-medium transition-all ${
                stage === 'skinning'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-semibold'
                  : 'text-slate-400 hover:bg-slate-800/60'
              }`}
            >
              2. Skin
            </button>
            <button
              onClick={() => setStage('testing')}
              className={`py-1 rounded font-medium transition-all ${
                stage === 'testing'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-semibold'
                  : 'text-slate-400 hover:bg-slate-800/60'
              }`}
            >
              3. Test
            </button>
            <button
              onClick={() => setStage('export')}
              className={`py-1 rounded font-medium transition-all ${
                stage === 'export'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-semibold'
                  : 'text-slate-400 hover:bg-slate-800/60'
              }`}
            >
              4. Export
            </button>
          </div>
        </div>

        {/* Scrollable Stage Content */}
        <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-xs custom-scroll">
          
          {/* STAGE 1: JOINT PLACEMENT */}
          {stage === 'placement' && (
            <>
              {/* MODE 1: PROPORTIONAL AUTO-RIG PANEL */}
              {placementMode === 'proportional' && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                      Wide-Range Arm Movement
                    </span>
                    <span className="text-[10px] text-slate-400">Kinematic Arc</span>
                  </div>

                  {/* Quick Posture Presets */}
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Quick Arm Postures</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={setPostureHandsOnHips}
                        className="p-1.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-left font-medium col-span-2 flex items-center justify-between"
                      >
                        <span>🧍 Hands on Hips (Akimbo)</span>
                        <span className="text-[9px] px-1 bg-cyan-500/20 rounded">Touch Hips</span>
                      </button>
                      <button
                        onClick={() => {
                          setArmSpread(1.0); setArmPitch(0); setElbowFlex(0);
                          applyProportionalFit({ spread: 1.0, pitch: 0, elbowFlex: 0 }, false);
                        }}
                        className="p-1.5 rounded bg-slate-900 hover:bg-slate-850 border border-slate-800 text-left"
                      >
                        <span className="block font-medium text-slate-200">T-Pose (0°)</span>
                        <span className="text-[9px] text-slate-500">Horizontal</span>
                      </button>
                      <button
                        onClick={() => {
                          setArmSpread(0.5); setArmPitch(0); setElbowFlex(0);
                          applyProportionalFit({ spread: 0.5, pitch: 0, elbowFlex: 0 }, false);
                        }}
                        className="p-1.5 rounded bg-slate-900 hover:bg-slate-850 border border-slate-800 text-left"
                      >
                        <span className="block font-medium text-slate-200">A-Pose (45°)</span>
                        <span className="text-[9px] text-slate-500">Relaxed</span>
                      </button>
                    </div>
                  </div>

                  {/* Sliders for Full Arm Range */}
                  <div className="space-y-2 pt-1 border-t border-slate-800/60">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 font-medium">Arm Elevation (Spread)</span>
                        <span className="text-cyan-400 font-mono text-[11px]">
                          {armSpread < 0 ? 'Touching Hips' : armSpread > 1.1 ? 'Overhead' : `${Math.round(armSpread * 100)}%`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-0.2"
                        max="1.4"
                        step="0.02"
                        value={armSpread}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setArmSpread(val);
                          applyProportionalFit({ spread: val, pitch: armPitch, elbowFlex }, true);
                        }}
                        className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                      <div className="flex justify-between text-[9px] text-slate-500">
                        <span>Touch Hips</span>
                        <span>A-Pose</span>
                        <span>T-Pose</span>
                        <span>Overhead</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 font-medium">Arm Forward/Back Pitch</span>
                        <span className="text-cyan-400 font-mono text-[11px]">{armPitch > 0 ? `+${Math.round(armPitch * 60)}°` : `${Math.round(armPitch * 60)}°`}</span>
                      </div>
                      <input
                        type="range"
                        min="-0.5"
                        max="0.8"
                        step="0.02"
                        value={armPitch}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setArmPitch(val);
                          applyProportionalFit({ spread: armSpread, pitch: val, elbowFlex }, true);
                        }}
                        className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 font-medium">Elbow Flexion</span>
                        <span className="text-cyan-400 font-mono text-[11px]">{Math.round(elbowFlex * 85)}°</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.02"
                        value={elbowFlex}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setElbowFlex(val);
                          applyProportionalFit({ spread: armSpread, pitch: armPitch, elbowFlex: val }, true);
                        }}
                        className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => requestProportionalRecalculate(false)}
                    className="w-full py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-medium transition-all"
                  >
                    Fit Skeleton to Stature
                  </button>
                </div>
              )}

              {/* MODE 2: KINEMATIC POSE TRANSFER (WITH EXPLICIT CONFIRMATION) */}
              {placementMode === 'pose-transfer' && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                      <Move className="w-3.5 h-3.5 text-emerald-400" />
                      Two-Bone IK Mannequin (Teacher)
                    </span>
                    <span className="text-[10px] text-slate-400">Scale-Independent</span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Pose the teacher mannequin to match arbitrary model stances, then transfer joint positions with bone length preservation.
                  </p>

                  <div className="space-y-1.5 pt-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Teacher Pose Presets</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(MANNEQUIN_PRESETS).map(([key, cfg]) => (
                        <button
                          key={key}
                          onClick={() => setActivePosePreset(key)}
                          className={`p-2 rounded border text-left transition-all ${
                            activePosePreset === key
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                              : 'bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-300'
                          }`}
                        >
                          <span className="font-semibold text-xs block">{cfg.name}</span>
                          <span className="text-[10px] text-slate-500 block truncate">{cfg.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => requestPoseTransferWithConfirmation(activePosePreset)}
                    className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Use This Pose & Transfer to Model
                  </button>
                </div>
              )}

              {/* MODE 3: MANUAL OVERRIDE (ALWAYS ACCESSIBLE WITH NUDGE PANEL) */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Manual Joint Override
                  </span>
                  <div className="flex bg-slate-950 p-0.5 rounded border border-slate-800">
                    <button
                      onClick={() => setGizmoMode('translate')}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                        gizmoMode === 'translate' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                      }`}
                    >
                      Pos (G)
                    </button>
                    <button
                      onClick={() => setGizmoMode('rotate')}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                        gizmoMode === 'rotate' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                      }`}
                    >
                      Rot (R)
                    </button>
                  </div>
                </div>

                {/* Selected Joint Details & Reliable Numeric Typing Inputs */}
                {currentJointRecord && (
                  <div className="rounded-lg bg-slate-900/90 p-2.5 border border-slate-800 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase text-slate-400 font-bold">Selected Joint</span>
                      <span className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1">
                        {currentJointRecord.userEdited && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Custom
                          </span>
                        )}
                        {currentJointRecord.name}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] text-slate-400 block font-medium">X (Model)</label>
                          <div className="flex gap-0.5">
                            <button
                              type="button"
                              onClick={() => stepCoordinate(0, -0.01)}
                              className="px-1 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[9px] leading-none"
                              title="Decrease X by 0.01m"
                            >
                              ▼
                            </button>
                            <button
                              type="button"
                              onClick={() => stepCoordinate(0, 0.01)}
                              className="px-1 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[9px] leading-none"
                              title="Increase X by 0.01m"
                            >
                              ▲
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={inputCoordX}
                          onChange={(e) => handleNumericCoordinateChange(0, e.target.value)}
                          onBlur={() => handleNumericCoordinateCommit(0)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleNumericCoordinateCommit(0); }}
                          title="Type numeric coordinate (moves ONLY this joint) and press Enter"
                          className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-xs font-mono text-white focus:border-amber-400 outline-none mt-0.5"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] text-slate-400 block font-medium">Y (Model)</label>
                          <div className="flex gap-0.5">
                            <button
                              type="button"
                              onClick={() => stepCoordinate(1, -0.01)}
                              className="px-1 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[9px] leading-none"
                              title="Decrease Y by 0.01m"
                            >
                              ▼
                            </button>
                            <button
                              type="button"
                              onClick={() => stepCoordinate(1, 0.01)}
                              className="px-1 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[9px] leading-none"
                              title="Increase Y by 0.01m"
                            >
                              ▲
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={inputCoordY}
                          onChange={(e) => handleNumericCoordinateChange(1, e.target.value)}
                          onBlur={() => handleNumericCoordinateCommit(1)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleNumericCoordinateCommit(1); }}
                          title="Type numeric coordinate (moves ONLY this joint) and press Enter"
                          className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-xs font-mono text-white focus:border-amber-400 outline-none mt-0.5"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] text-slate-400 block font-medium">Z (Model)</label>
                          <div className="flex gap-0.5">
                            <button
                              type="button"
                              onClick={() => stepCoordinate(2, -0.01)}
                              className="px-1 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[9px] leading-none"
                              title="Decrease Z by 0.01m"
                            >
                              ▼
                            </button>
                            <button
                              type="button"
                              onClick={() => stepCoordinate(2, 0.01)}
                              className="px-1 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[9px] leading-none"
                              title="Increase Z by 0.01m"
                            >
                              ▲
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={inputCoordZ}
                          onChange={(e) => handleNumericCoordinateChange(2, e.target.value)}
                          onBlur={() => handleNumericCoordinateCommit(2)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleNumericCoordinateCommit(2); }}
                          title="Type numeric coordinate (moves ONLY this joint) and press Enter"
                          className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-xs font-mono text-white focus:border-amber-400 outline-none mt-0.5"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* RESTORED MANUAL ROTATION SLIDER FOR JOINTS & LIMB CHAINS */}
                {currentJointRecord && (
                  <div className="rounded-lg bg-slate-900/90 p-2.5 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-amber-300 flex items-center gap-1">
                        <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                        Manual Rotation Slider
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {currentDescendants.length} child joints
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Rotate limb chain from <strong className="text-amber-300">{currentJointRecord.name}</strong> pivot (preserves bone lengths):
                    </p>

                    {/* Axis Switcher Tabs */}
                    <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded border border-slate-800 text-[10px]">
                      <button
                        type="button"
                        onClick={() => { setJointRotAxis('pitch'); setJointRotSliderVal(0); }}
                        className={`py-1 rounded font-medium transition-all ${
                          jointRotAxis === 'pitch' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Pitch (X)
                      </button>
                      <button
                        type="button"
                        onClick={() => { setJointRotAxis('yaw'); setJointRotSliderVal(0); }}
                        className={`py-1 rounded font-medium transition-all ${
                          jointRotAxis === 'yaw' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Yaw (Y)
                      </button>
                      <button
                        type="button"
                        onClick={() => { setJointRotAxis('roll'); setJointRotSliderVal(0); }}
                        className={`py-1 rounded font-medium transition-all ${
                          jointRotAxis === 'roll' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Roll (Z)
                      </button>
                    </div>

                    {/* Interactive Continuous Range Slider */}
                    <div className="space-y-1.5 bg-slate-950 p-2 rounded border border-slate-800">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-400 font-medium">
                          Rotate {jointRotAxis.toUpperCase()} ({currentJointRecord.name})
                        </span>
                        <span className="font-mono font-bold text-amber-300">
                          {jointRotSliderVal > 0 ? `+${jointRotSliderVal}` : jointRotSliderVal}°
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        step="1"
                        value={jointRotSliderVal}
                        onPointerDown={() => {
                          baselineJointsBeforeRotRef.current = snapshotJoints();
                        }}
                        onChange={(e) => handleJointRotSliderChange(parseFloat(e.target.value))}
                        onPointerUp={handleJointRotSliderCommit}
                        className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded cursor-pointer"
                      />
                      <div className="flex justify-between text-[9px] font-mono text-slate-500">
                        <span>-180°</span>
                        <span>-90°</span>
                        <span>0°</span>
                        <span>+90°</span>
                        <span>+180°</span>
                      </div>
                    </div>

                    {/* Quick Rotation Buttons */}
                    <div className="space-y-1 pt-0.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-medium">Quick Step ({jointRotAxis.toUpperCase()})</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const p = jointRotAxis === 'pitch' ? -15 : 0;
                              const y = jointRotAxis === 'yaw' ? -15 : 0;
                              const r = jointRotAxis === 'roll' ? -15 : 0;
                              handleNudgeChain(p, y, r);
                            }}
                            className="px-1.5 py-0.5 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300 text-[10px]"
                          >
                            -15°
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const p = jointRotAxis === 'pitch' ? -5 : 0;
                              const y = jointRotAxis === 'yaw' ? -5 : 0;
                              const r = jointRotAxis === 'roll' ? -5 : 0;
                              handleNudgeChain(p, y, r);
                            }}
                            className="px-1.5 py-0.5 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300 text-[10px]"
                          >
                            -5°
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setJointRotSliderVal(0);
                              baselineJointsBeforeRotRef.current = null;
                            }}
                            className="px-1.5 py-0.5 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-amber-400 text-[10px] font-semibold"
                          >
                            0°
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const p = jointRotAxis === 'pitch' ? 5 : 0;
                              const y = jointRotAxis === 'yaw' ? 5 : 0;
                              const r = jointRotAxis === 'roll' ? 5 : 0;
                              handleNudgeChain(p, y, r);
                            }}
                            className="px-1.5 py-0.5 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300 text-[10px]"
                          >
                            +5°
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const p = jointRotAxis === 'pitch' ? 15 : 0;
                              const y = jointRotAxis === 'yaw' ? 15 : 0;
                              const r = jointRotAxis === 'roll' ? 15 : 0;
                              handleNudgeChain(p, y, r);
                            }}
                            className="px-1.5 py-0.5 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300 text-[10px]"
                          >
                            +15°
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Symmetry & X-Ray */}
                <div className="space-y-1.5 pt-1">
                  <label className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800 cursor-pointer hover:bg-slate-850">
                    <span className="text-slate-300 font-medium">Sagittal Symmetry (X &harr; -X)</span>
                    <input
                      type="checkbox"
                      checked={symmetryEnabled}
                      onChange={(e) => {
                        setSymmetryEnabled(e.target.checked);
                        notify(`Sagittal symmetry ${e.target.checked ? 'enabled' : 'disabled'}`);
                      }}
                      className="accent-cyan-400 w-4 h-4 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800 cursor-pointer hover:bg-slate-850">
                    <span className="text-slate-300 font-medium">X-Ray Joint View</span>
                    <input
                      type="checkbox"
                      checked={xrayEnabled}
                      onChange={(e) => {
                        setXrayEnabled(e.target.checked);
                        notify(`X-Ray view ${e.target.checked ? 'enabled' : 'disabled'}`);
                      }}
                      className="accent-cyan-400 w-4 h-4 rounded"
                    />
                  </label>
                </div>

                {/* Undo / Redo */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={executeUndo}
                    disabled={undoCount === 0}
                    className="flex-1 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Undo ({undoCount})
                  </button>
                  <button
                    onClick={executeRedo}
                    disabled={redoCount === 0}
                    className="flex-1 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 transition-all"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    Redo ({redoCount})
                  </button>
                </div>
              </div>
            </>
          )}

          {/* STAGE 2: SKIN BINDING */}
          {stage === 'skinning' && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-purple-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  Skin Binding Stage
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  isSkinBound ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-slate-800 text-slate-400'
                }`}>
                  {isSkinBound ? 'Bound & Active' : 'Unbound'}
                </span>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Converts joint records into parent-relative <code className="text-cyan-300">THREE.Bone</code> hierarchy with Sagittal Separation.
              </p>

              <label className="flex items-start justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                <div>
                  <span className="text-slate-200 font-medium block">Sagittal Plane Separation</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Eliminates cross-leg & cross-arm bleeding by enforcing strict X-side boundaries.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={sagittalSeparation}
                  onChange={(e) => setSagittalSeparation(e.target.checked)}
                  className="accent-purple-400 w-4 h-4 mt-0.5 rounded"
                />
              </label>

              <button
                onClick={handleBindSkin}
                className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-1.5"
              >
                <Layers className="w-4 h-4" />
                Calculate Weights & Bind Skin
              </button>
            </div>
          )}

          {/* STAGE 3: TEST BENCH WITH DEDICATED POSE LIBRARY & ROBOTICS */}
          {stage === 'testing' && (
            <div className="space-y-3">
              {/* Test Bench Sub-Tab Navigation */}
              <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
                <button
                  onClick={() => setTestBenchSubTab('motions')}
                  className={`py-1.5 rounded font-medium transition-all ${
                    testBenchSubTab === 'motions'
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-semibold'
                      : 'text-slate-400 hover:bg-slate-850'
                  }`}
                >
                  Motions
                </button>
                <button
                  onClick={() => setTestBenchSubTab('library')}
                  className={`py-1.5 rounded font-medium transition-all flex items-center justify-center gap-1 ${
                    testBenchSubTab === 'library'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                      : 'text-slate-400 hover:bg-slate-850'
                  }`}
                >
                  <Bookmark className="w-3 h-3" />
                  Pose Library
                </button>
                <button
                  onClick={() => setTestBenchSubTab('puppeteer')}
                  className={`py-1.5 rounded font-medium transition-all flex items-center justify-center gap-1 ${
                    testBenchSubTab === 'puppeteer'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                      : 'text-slate-400 hover:bg-slate-850'
                  }`}
                >
                  <Crosshair className="w-3 h-3" />
                  Robotics
                </button>
              </div>

              {/* SUB-TAB 1: LIVE PROCEDURAL MOTIONS */}
              {testBenchSubTab === 'motions' && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sky-300 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-sky-400" />
                      Procedural Motion Bench
                    </span>
                    <span className="text-[10px] text-slate-400">Live Deformations</span>
                  </div>

                  {!isSkinBound && (
                    <div className="p-2.5 rounded bg-amber-950/40 border border-amber-500/40 text-amber-200 text-[11px] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>Mesh is currently unbound. Bind skin to view live deformations.</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Procedural Motions</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'ambient_crowd', label: '👥 Intermittent Crowd Idle' },
                        { id: 'intermittent_walk', label: '⏳ Intermittent Walk' },
                        { id: 'walk', label: '🚶 Continuous Walk' },
                        { id: 'hands_on_hips', label: '🧍 Hands on Hips' },
                        { id: 'robot_servo', label: '🤖 Robot Axis Calibration' },
                        { id: 'wave', label: '👋 Arm Wave' },
                        { id: 'squat', label: '🏋️ Deep Squat' },
                        { id: 'twist', label: '🌪️ Torso Twist' },
                        { id: 'rest', label: '⏸️ Rest Bind Pose' }
                      ].map((anim) => (
                        <button
                          key={anim.id}
                          onClick={() => {
                            setCurrentAnimation(anim.id as TestAnimationType);
                            setIsPlayingAnim(true);
                            notify(`Playing motion: ${anim.label}`);
                          }}
                          className={`p-2 rounded text-left text-xs font-medium border transition-all ${
                            anim.id === 'ambient_crowd' || anim.id === 'rest' ? 'col-span-2' : ''
                          } ${
                            currentAnimation === anim.id
                              ? 'bg-sky-500/20 border-sky-500/50 text-sky-200'
                              : 'bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-300'
                          }`}
                        >
                          {anim.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-800/60">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setIsPlayingAnim(!isPlayingAnim)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 text-xs font-semibold"
                      >
                        {isPlayingAnim ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        {isPlayingAnim ? 'Pause' : 'Play'}
                      </button>
                      <span className="font-mono text-sky-400 text-xs">{animSpeed.toFixed(1)}x speed</span>
                    </div>

                    <input
                      type="range"
                      min="0.2"
                      max="2.0"
                      step="0.1"
                      value={animSpeed}
                      onChange={(e) => setAnimSpeed(parseFloat(e.target.value))}
                      className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded"
                    />
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: DEDICATED POSE LIBRARY */}
              {testBenchSubTab === 'library' && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                      <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                      Pose Library (Session & Storage)
                    </span>
                    <div className="flex gap-1">
                      <label title="Import Poses JSON" className="p-1 rounded bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <input type="file" accept=".json" onChange={handleImportPoseLibrary} className="hidden" />
                      </label>
                      <button
                        onClick={handleExportPoseLibrary}
                        title="Download Pose Library JSON"
                        className="p-1 rounded bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Save Current Pose Box */}
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Capture Current Pose</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Pose Name (e.g. Combat Ready)"
                        value={newPoseNameInput}
                        onChange={(e) => setNewPoseNameInput(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-amber-400"
                      />
                      <button
                        onClick={handleSaveCurrentPose}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Save Pose
                      </button>
                    </div>
                  </div>

                  {/* Saved Poses List */}
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 custom-scroll">
                    {savedPoses.map((pose) => (
                      <div
                        key={pose.id}
                        className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-2 transition-all"
                      >
                        <div className="flex-1 truncate">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs text-slate-200 truncate">{pose.name}</span>
                            {pose.isCustom ? (
                              <span className="px-1 py-0.2 rounded text-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Custom
                              </span>
                            ) : (
                              <span className="px-1 py-0.2 rounded text-[8px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                Preset
                              </span>
                            )}
                          </div>
                          {pose.description && (
                            <span className="text-[10px] text-slate-500 block truncate">{pose.description}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleApplySavedPose(pose)}
                            className="px-2 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded text-xs font-medium"
                          >
                            Apply
                          </button>
                          {pose.isCustom && (
                            <button
                              onClick={() => handleDeleteSavedPose(pose.id)}
                              className="p-1 rounded bg-slate-950 hover:bg-red-950/60 border border-slate-800 hover:border-red-700 text-slate-500 hover:text-red-300"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SUB-TAB 3: ROBOTIC LIMB ISOLATION & PUPPETEER */}
              {testBenchSubTab === 'puppeteer' && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-emerald-400" />
                      Robotic Limb Freeze
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => toggleAllLimbLocks(true)}
                        className="px-2 py-0.5 rounded bg-red-950/60 text-red-300 border border-red-800 text-[10px] font-medium"
                      >
                        Freeze All
                      </button>
                      <button
                        onClick={() => toggleAllLimbLocks(false)}
                        className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800 text-[10px] font-medium"
                      >
                        Unlock All
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => {
                        const next = !limbLocks.rightArm;
                        setLimbLocks(p => ({ ...p, rightArm: next }));
                        notify(next ? '🔒 Right Arm FROZEN' : '🔓 Right Arm UNLOCKED');
                      }}
                      className={`p-2 rounded border flex items-center justify-between text-xs transition-all ${
                        limbLocks.rightArm ? 'bg-amber-950/50 border-amber-600/60 text-amber-200' : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                      }`}
                    >
                      <span>Right Arm</span>
                      {limbLocks.rightArm ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3 text-slate-500" />}
                    </button>

                    <button
                      onClick={() => {
                        const next = !limbLocks.leftArm;
                        setLimbLocks(p => ({ ...p, leftArm: next }));
                        notify(next ? '🔒 Left Arm FROZEN' : '🔓 Left Arm UNLOCKED');
                      }}
                      className={`p-2 rounded border flex items-center justify-between text-xs transition-all ${
                        limbLocks.leftArm ? 'bg-amber-950/50 border-amber-600/60 text-amber-200' : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                      }`}
                    >
                      <span>Left Arm</span>
                      {limbLocks.leftArm ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3 text-slate-500" />}
                    </button>

                    <button
                      onClick={() => {
                        const next = !limbLocks.legs;
                        setLimbLocks(p => ({ ...p, legs: next }));
                        notify(next ? '🔒 Legs FROZEN' : '🔓 Legs UNLOCKED');
                      }}
                      className={`p-2 rounded border flex items-center justify-between text-xs transition-all ${
                        limbLocks.legs ? 'bg-amber-950/50 border-amber-600/60 text-amber-200' : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                      }`}
                    >
                      <span>Legs / Stance</span>
                      {limbLocks.legs ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3 text-slate-500" />}
                    </button>

                    <button
                      onClick={() => {
                        const next = !limbLocks.torso;
                        setLimbLocks(p => ({ ...p, torso: next }));
                        notify(next ? '🔒 Torso FROZEN' : '🔓 Torso UNLOCKED');
                      }}
                      className={`p-2 rounded border flex items-center justify-between text-xs transition-all ${
                        limbLocks.torso ? 'bg-amber-950/50 border-amber-600/60 text-amber-200' : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                      }`}
                    >
                      <span>Torso / Spine</span>
                      {limbLocks.torso ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3 text-slate-500" />}
                    </button>
                  </div>

                  {/* Dual-Stick Controller */}
                  <div className="pt-2 border-t border-slate-800/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                        <Crosshair className="w-3 h-3 text-emerald-400" />
                        Live Stick Puppeteer
                      </span>
                      <button onClick={resetJoysticks} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400">
                        Center
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      {/* Left Stick Pad */}
                      <div className="flex flex-col items-center space-y-1">
                        <span className="text-[10px] font-semibold text-slate-300">Left Arm Stick</span>
                        <div
                          onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            handleJoystickMove('left', e);
                          }}
                          onPointerMove={(e) => {
                            if (e.buttons === 1) handleJoystickMove('left', e);
                          }}
                          onPointerUp={(e) => {
                            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
                          }}
                          className={`w-24 h-24 rounded-full bg-slate-950 border-2 relative flex items-center justify-center cursor-crosshair shadow-inner touch-none ${
                            limbLocks.leftArm ? 'border-amber-600/40 opacity-50' : 'border-emerald-500/50 hover:border-emerald-400'
                          }`}
                        >
                          <div className="absolute inset-x-2 top-1/2 h-[1px] bg-slate-800/80 pointer-events-none" />
                          <div className="absolute inset-y-2 left-1/2 w-[1px] bg-slate-800/80 pointer-events-none" />
                          <div
                            style={{ transform: `translate(${robotSticks.leftStick.x * 32}px, ${-robotSticks.leftStick.y * 32}px)` }}
                            className={`w-7 h-7 rounded-full shadow-lg flex items-center justify-center pointer-events-none transition-transform duration-75 ${
                              limbLocks.leftArm ? 'bg-amber-600' : 'bg-emerald-500 text-slate-950 font-bold'
                            }`}
                          >
                            {limbLocks.leftArm ? <Lock className="w-3 h-3 text-white" /> : <span className="text-[9px]">L</span>}
                          </div>
                        </div>
                      </div>

                      {/* Right Stick Pad */}
                      <div className="flex flex-col items-center space-y-1">
                        <span className="text-[10px] font-semibold text-slate-300">Right Arm Stick</span>
                        <div
                          onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            handleJoystickMove('right', e);
                          }}
                          onPointerMove={(e) => {
                            if (e.buttons === 1) handleJoystickMove('right', e);
                          }}
                          onPointerUp={(e) => {
                            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
                          }}
                          className={`w-24 h-24 rounded-full bg-slate-950 border-2 relative flex items-center justify-center cursor-crosshair shadow-inner touch-none ${
                            limbLocks.rightArm ? 'border-amber-600/40 opacity-50' : 'border-cyan-500/50 hover:border-cyan-400'
                          }`}
                        >
                          <div className="absolute inset-x-2 top-1/2 h-[1px] bg-slate-800/80 pointer-events-none" />
                          <div className="absolute inset-y-2 left-1/2 w-[1px] bg-slate-800/80 pointer-events-none" />
                          <div
                            style={{ transform: `translate(${robotSticks.rightStick.x * 32}px, ${-robotSticks.rightStick.y * 32}px)` }}
                            className={`w-7 h-7 rounded-full shadow-lg flex items-center justify-center pointer-events-none transition-transform duration-75 ${
                              limbLocks.rightArm ? 'bg-amber-600' : 'bg-cyan-400 text-slate-950 font-bold'
                            }`}
                          >
                            {limbLocks.rightArm ? <Lock className="w-3 h-3 text-white" /> : <span className="text-[9px]">R</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STAGE 4: EXPORT */}
          {stage === 'export' && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-indigo-300 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-indigo-400" />
                  GLB Character Export
                </span>
                <span className="text-[10px] text-slate-400">KHR Quantized</span>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Exports the rigged character complete with embedded <code className="text-cyan-300">THREE.Skeleton</code> hierarchy and vertex skin weights into standard Binary GLTF (.GLB).
              </p>

              <button
                onClick={handleExportGLB}
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                Export & Download .GLB
              </button>
            </div>
          )}

          {/* INDEPENDENT 3D MODEL & SKELETON ALIGNMENT */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Independent Rotation</span>
              <span className="text-[10px] text-cyan-400 font-mono truncate max-w-[120px]">{modelName}</span>
            </div>

            {/* INDEPENDENT ROTATION & ALIGNMENT DECK */}
            <div className="rounded-lg bg-slate-900/90 p-2.5 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white font-semibold flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-cyan-400" />
                  Independent Orientation & Alignment
                </span>
                <span className="text-[10px] text-cyan-400 font-mono truncate max-w-[100px]">{modelName}</span>
              </div>

              {/* 3-Tab Selector: Model Only | Skeleton Only | Both (Turntable) */}
              <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px] font-semibold">
                <button
                  onClick={() => setRotationTab('model')}
                  className={`py-1 rounded text-center transition-all ${
                    rotationTab === 'model'
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  👤 Model Only
                </button>
                <button
                  onClick={() => setRotationTab('skeleton')}
                  className={`py-1 rounded text-center transition-all ${
                    rotationTab === 'skeleton'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  🦴 Skeleton Only
                </button>
                <button
                  onClick={() => setRotationTab('both')}
                  className={`py-1 rounded text-center transition-all ${
                    rotationTab === 'both'
                      ? 'bg-purple-500 text-slate-950 font-bold shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  🔄 Both (Scene)
                </button>
              </div>

              {/* TAB 1: MODEL MESH ONLY */}
              {rotationTab === 'model' && (
                <div className="space-y-2 text-[11px]">
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span>Rotate imported mesh without moving bones:</span>
                    <span className="font-mono text-cyan-300">Y:{modelMeshRotation.y}° X:{modelMeshRotation.x}° Z:{modelMeshRotation.z}°</span>
                  </div>
                  {/* Yaw Y */}
                  <div className="grid grid-cols-4 gap-1">
                    <button
                      onClick={() => rotateModelMesh('y', -90)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-cyan-300 font-medium"
                    >
                      Yaw Y -90°
                    </button>
                    <button
                      onClick={() => rotateModelMesh('y', 90)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-cyan-300 font-medium"
                    >
                      Yaw Y +90°
                    </button>
                    <button
                      onClick={() => rotateModelMesh('y', 180)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300"
                    >
                      Flip 180°
                    </button>
                    <button
                      onClick={resetModelMeshRotation}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-400"
                    >
                      Reset Rot
                    </button>
                  </div>
                  {/* Pitch X & Roll Z */}
                  <div className="grid grid-cols-4 gap-1 pt-0.5">
                    <button
                      onClick={() => rotateModelMesh('x', 90)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300"
                    >
                      Pitch X +90°
                    </button>
                    <button
                      onClick={() => rotateModelMesh('x', -90)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300"
                    >
                      Pitch X -90°
                    </button>
                    <button
                      onClick={() => rotateModelMesh('z', 90)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300"
                    >
                      Roll Z +90°
                    </button>
                    <button
                      onClick={() => rotateModelMesh('z', -90)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300"
                    >
                      Roll Z -90°
                    </button>
                  </div>
                  {/* 1-Click Center & Ground */}
                  <button
                    onClick={handleCenterModelMesh}
                    className="w-full py-1.5 rounded bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800 text-cyan-200 text-[10px] font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Target className="w-3 h-3 text-cyan-400" />
                    Center & Ground Model (X=0, Z=0, Feet on Floor)
                  </button>
                </div>
              )}

              {/* TAB 2: SKELETON ONLY */}
              {rotationTab === 'skeleton' && (
                <div className="space-y-2 text-[11px]">
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span>Rotate bones without moving model mesh:</span>
                    <span className="font-mono text-amber-300">Y:{skeletonRotation.y}° X:{skeletonRotation.x}° Z:{skeletonRotation.z}°</span>
                  </div>
                  {/* Yaw Y */}
                  <div className="grid grid-cols-4 gap-1">
                    <button
                      onClick={() => rotateSkeleton('y', -90)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-amber-300 font-medium"
                    >
                      Yaw Y -90°
                    </button>
                    <button
                      onClick={() => rotateSkeleton('y', 90)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-amber-300 font-medium"
                    >
                      Yaw Y +90°
                    </button>
                    <button
                      onClick={() => rotateSkeleton('y', 180)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300"
                    >
                      Flip 180°
                    </button>
                    <button
                      onClick={resetSkeletonRotation}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-400"
                    >
                      Reset Bones
                    </button>
                  </div>
                  {/* Pitch X & Roll Z */}
                  <div className="grid grid-cols-4 gap-1 pt-0.5">
                    <button
                      onClick={() => rotateSkeleton('x', 90)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300"
                    >
                      Pitch X +90°
                    </button>
                    <button
                      onClick={() => rotateSkeleton('x', -90)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300"
                    >
                      Pitch X -90°
                    </button>
                    <button
                      onClick={() => rotateSkeleton('z', 90)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300"
                    >
                      Roll Z +90°
                    </button>
                    <button
                      onClick={() => rotateSkeleton('z', -90)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300"
                    >
                      Roll Z -90°
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: BOTH (TURNTABLE / SCENE ROTATION) */}
              {rotationTab === 'both' && (
                <div className="space-y-2 text-[11px]">
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span>Rotate whole character (model + bones together):</span>
                    <span className="font-mono text-purple-300">Y:{sceneTurntableDeg}°</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    <button
                      onClick={() => rotateBothTogether('y', -90)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-purple-300 font-medium"
                    >
                      Turn Y -90°
                    </button>
                    <button
                      onClick={() => rotateBothTogether('y', 90)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-purple-300 font-medium"
                    >
                      Turn Y +90°
                    </button>
                    <button
                      onClick={() => rotateBothTogether('y', 180)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300"
                    >
                      Flip 180°
                    </button>
                    <button
                      onClick={resetBothRotation}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-400"
                    >
                      Reset View
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1 pt-0.5">
                    <button
                      onClick={() => rotateBothTogether('x', 45)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300"
                    >
                      Tilt Up +45°
                    </button>
                    <button
                      onClick={() => rotateBothTogether('x', -45)}
                      className="py-1 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300"
                    >
                      Tilt Down -45°
                    </button>
                  </div>
                  {/* Turntable Auto-Spin Toggle */}
                  <button
                    onClick={() => {
                      setIsTurntableActive(p => !p);
                      notify(!isTurntableActive ? 'Turntable 360° spin activated' : 'Turntable spin paused');
                    }}
                    className={`w-full py-1.5 rounded text-[10px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      isTurntableActive
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                        : 'bg-purple-950/60 hover:bg-purple-900/60 border border-purple-800 text-purple-200'
                    }`}
                  >
                    <Repeat className="w-3 h-3" />
                    {isTurntableActive ? 'Stop Turntable Continuous Spin' : 'Start Turntable Continuous Spin'}
                  </button>
                </div>
              )}
            </div>

            {/* Magnetic Landmarks Quick Action */}
            <button
              onClick={handleSnapAllToLandmarks}
              className="w-full py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm"
            >
              <Target className="w-3.5 h-3.5" />
              Snap All Joints to Landmarks
            </button>

            {/* Sample Models & File Upload */}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                onClick={loadHumanoidSample}
                className="p-2 rounded bg-slate-900 hover:bg-slate-850 border border-slate-800 text-left"
              >
                <span className="block font-medium text-slate-200 text-xs">Mannequin</span>
                <span className="text-[10px] text-slate-500">Stylized 1.8m</span>
              </button>
              <button
                onClick={loadCyberFighterSample}
                className="p-2 rounded bg-slate-900 hover:bg-slate-850 border border-slate-800 text-left"
              >
                <span className="block font-medium text-slate-200 text-xs">Cyber Fighter</span>
                <span className="text-[10px] text-slate-500">With Katana</span>
              </button>
            </div>

            <label className="block w-full py-2 px-3 rounded-lg border border-dashed border-slate-700 hover:border-cyan-500/60 bg-slate-900/50 hover:bg-slate-900 text-center cursor-pointer transition-all">
              <span className="text-xs text-cyan-400 font-medium block flex items-center justify-center gap-1">
                <Upload className="w-3.5 h-3.5" /> Upload Custom GLB / GLTF
              </span>
              <span className="text-[10px] text-slate-500 block">Provisional load (retains work on error)</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".glb,.gltf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

        </div>
      </aside>

      {/* CENTER VIEWPORT OVERLAYS */}
      <main className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
        
        {/* Top Status Banner & Camera Pills */}
        <div className="flex items-center justify-between pt-14">
          <div className="pointer-events-auto ml-96 flex items-center gap-2 rounded-lg bg-slate-900/90 border border-slate-800 px-3.5 py-1.5 text-xs shadow-xl backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="font-medium text-slate-200">{toastMessage}</span>
          </div>

          <div className="pointer-events-auto mr-76 flex gap-1 rounded-lg bg-slate-900/80 p-1 border border-slate-800 text-xs shadow-lg backdrop-blur-md">
            <button onClick={() => setCameraPreset('front')} className="px-2.5 py-1 rounded hover:bg-slate-800 text-slate-300">Front</button>
            <button onClick={() => setCameraPreset('side')} className="px-2.5 py-1 rounded hover:bg-slate-800 text-slate-300">Side</button>
            <button onClick={() => setCameraPreset('top')} className="px-2.5 py-1 rounded hover:bg-slate-800 text-slate-300">Top</button>
            <button onClick={() => setCameraPreset('perspective')} className="px-2.5 py-1 rounded hover:bg-slate-800 text-slate-300">3D Free</button>
          </div>
        </div>

        {/* Bottom Viewport Bar */}
        <div className="flex items-center justify-between pl-96 pr-76 pb-1 text-[11px] text-slate-400">
          <div className="pointer-events-auto rounded-md bg-slate-900/85 px-3 py-1 border border-slate-800 backdrop-blur-sm flex items-center gap-3">
            <span>💡 <b>Tip:</b> Click any sphere. G=Move, R=Rotate. Rotate model independently.</span>
            <span className="text-cyan-400 font-medium">Model Y:{modelMeshRotation.y}° | Skel:{skeletonRotation.y}°</span>
          </div>
          <div className="pointer-events-auto rounded-md bg-slate-900/85 px-3 py-1 border border-slate-800 font-mono text-cyan-400 backdrop-blur-sm">
            Joints: {jointRecordsRef.current.size} / 18 | Model: {modelName}
          </div>
        </div>

      </main>

      {/* RIGHT SIDEBAR: AUTHORITATIVE JOINT RECORD MAP */}
      <aside className="pointer-events-auto absolute right-4 top-18 bottom-4 z-10 w-72 flex flex-col rounded-xl border border-slate-800/80 bg-slate-900/85 p-3.5 backdrop-blur-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Joint Hierarchy Tree
            </label>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">Model-Space</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1 text-xs custom-scroll">
          {Array.from(jointRecordsRef.current.entries()).map(([id, rec]) => {
            const isSelected = id === selectedJointId;
            const side = id.startsWith('left') ? 'left' : id.startsWith('right') ? 'right' : 'center';

            return (
              <div
                key={id}
                onClick={() => setSelectedJointId(id)}
                className={`p-1.5 rounded cursor-pointer flex items-center justify-between transition-all ${
                  isSelected
                    ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 font-medium'
                    : 'hover:bg-slate-850/80 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      side === 'left' ? 'bg-emerald-400' : side === 'right' ? 'bg-red-400' : 'bg-cyan-400'
                    }`}
                  />
                  {(() => {
                    const lm = LANDMARK_DEFINITIONS.find(l => l.jointId === id);
                    return lm ? (
                      <span className="text-[9px] px-1 py-0.2 rounded font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700" title={`Paired Landmark #${lm.badgeNumber}: ${lm.name}`}>
                        #{lm.badgeNumber}
                      </span>
                    ) : null;
                  })()}
                  <span className="font-medium truncate">{rec.name}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {rec.userEdited && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Edited
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500 font-mono">
                    {rec.positionModelSpace[1].toFixed(2)}m
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

    </div>
  );
}
