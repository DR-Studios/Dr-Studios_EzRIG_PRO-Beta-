import * as THREE from 'three';

/**
 * Creates a stylized anatomical humanoid base mesh with market-ready visuals.
 * Includes smooth joint articulators at shoulders, elbows, wrists, hips, and knees
 * so limbs look continuous, sleek, and realistic rather than broken or disjointed.
 */
export function createStylizedHumanoid(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'StylizedHumanoid';

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.4,
    metalness: 0.15
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.3,
    metalness: 0.25
  });

  const jointsMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.45,
    metalness: 0.5
  });

  // Helper to add sleek spherical joint articulation balls
  const addJointBall = (pos: THREE.Vector3, radius: number, mat = jointsMat) => {
    const geo = new THREE.SphereGeometry(radius, 20, 20);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // Helper for limb segments
  const createLimb = (
    name: string,
    topRadius: number,
    botRadius: number,
    length: number,
    pos: THREE.Vector3,
    rot: THREE.Euler,
    mat = bodyMat
  ) => {
    const geo = new THREE.CylinderGeometry(topRadius, botRadius, length, 18);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.position.copy(pos);
    mesh.rotation.copy(rot);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // Pelvis / Hips (Y: 0.95)
  const pelvisGeo = new THREE.CylinderGeometry(0.14, 0.12, 0.16, 20);
  const pelvis = new THREE.Mesh(pelvisGeo, bodyMat);
  pelvis.position.set(0, 0.95, 0);
  pelvis.castShadow = true;
  pelvis.receiveShadow = true;
  group.add(pelvis);

  // Lower Spine / Abdomen
  const spineGeo = new THREE.CylinderGeometry(0.12, 0.13, 0.18, 20);
  const spine = new THREE.Mesh(spineGeo, jointsMat);
  spine.position.set(0, 1.11, 0);
  spine.castShadow = true;
  group.add(spine);

  // Chest / Torso
  const chestGeo = new THREE.CylinderGeometry(0.19, 0.13, 0.26, 20);
  const chest = new THREE.Mesh(chestGeo, bodyMat);
  chest.position.set(0, 1.30, 0.01);
  chest.castShadow = true;
  group.add(chest);

  // Neck
  const neckGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.12, 18);
  const neck = new THREE.Mesh(neckGeo, jointsMat);
  neck.position.set(0, 1.48, 0);
  neck.castShadow = true;
  group.add(neck);

  // Head
  const headGeo = new THREE.SphereGeometry(0.125, 24, 24);
  headGeo.scale(0.9, 1.15, 1.0);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(0, 1.66, 0.02);
  head.castShadow = true;
  group.add(head);

  // Visor
  const visorGeo = new THREE.BoxGeometry(0.16, 0.06, 0.08);
  const visor = new THREE.Mesh(visorGeo, accentMat);
  visor.position.set(0, 1.67, 0.11);
  group.add(visor);

  // Shoulder Ball Joints
  addJointBall(new THREE.Vector3(0.19, 1.44, 0), 0.055);
  addJointBall(new THREE.Vector3(-0.19, 1.44, 0), 0.055);

  // Left Arm (T-Pose orientation, fully connected)
  createLimb('Left_UpperArm_Mesh', 0.052, 0.046, 0.28, new THREE.Vector3(0.33, 1.44, 0), new THREE.Euler(0, 0, -Math.PI / 2));
  // Left Elbow Joint Ball (bridges upper arm and forearm seamlessly)
  addJointBall(new THREE.Vector3(0.47, 1.44, 0), 0.045);
  createLimb('Left_Forearm_Mesh', 0.044, 0.038, 0.26, new THREE.Vector3(0.60, 1.44, 0), new THREE.Euler(0, 0, -Math.PI / 2));
  // Left Wrist Joint Ball
  addJointBall(new THREE.Vector3(0.73, 1.44, 0), 0.036);
  // Left Hand
  const leftHandGeo = new THREE.BoxGeometry(0.04, 0.075, 0.06);
  const leftHand = new THREE.Mesh(leftHandGeo, accentMat);
  leftHand.name = 'Left_Hand_Mesh';
  leftHand.position.set(0.79, 1.44, 0);
  leftHand.castShadow = true;
  group.add(leftHand);

  // Right Arm (T-Pose orientation, fully connected)
  createLimb('Right_UpperArm_Mesh', 0.052, 0.046, 0.28, new THREE.Vector3(-0.33, 1.44, 0), new THREE.Euler(0, 0, Math.PI / 2));
  // Right Elbow Joint Ball
  addJointBall(new THREE.Vector3(-0.47, 1.44, 0), 0.045);
  createLimb('Right_Forearm_Mesh', 0.044, 0.038, 0.26, new THREE.Vector3(-0.60, 1.44, 0), new THREE.Euler(0, 0, Math.PI / 2));
  // Right Wrist Joint Ball
  addJointBall(new THREE.Vector3(-0.73, 1.44, 0), 0.036);
  // Right Hand
  const rightHandGeo = new THREE.BoxGeometry(0.04, 0.075, 0.06);
  const rightHand = new THREE.Mesh(rightHandGeo, accentMat);
  rightHand.name = 'Right_Hand_Mesh';
  rightHand.position.set(-0.79, 1.44, 0);
  rightHand.castShadow = true;
  group.add(rightHand);

  // Hip Ball Joints
  addJointBall(new THREE.Vector3(0.12, 0.90, 0), 0.065);
  addJointBall(new THREE.Vector3(-0.12, 0.90, 0), 0.065);

  // Left Leg
  createLimb('Left_Thigh_Mesh', 0.075, 0.058, 0.40, new THREE.Vector3(0.12, 0.69, 0), new THREE.Euler(0, 0, 0));
  addJointBall(new THREE.Vector3(0.12, 0.49, 0.01), 0.055);
  createLimb('Left_Calf_Mesh', 0.056, 0.044, 0.40, new THREE.Vector3(0.12, 0.29, 0), new THREE.Euler(0, 0, 0));
  addJointBall(new THREE.Vector3(0.12, 0.09, 0), 0.042);
  // Left Foot
  const leftFootGeo = new THREE.BoxGeometry(0.085, 0.06, 0.18);
  const leftFoot = new THREE.Mesh(leftFootGeo, jointsMat);
  leftFoot.name = 'Left_Foot_Mesh';
  leftFoot.position.set(0.12, 0.03, 0.04);
  leftFoot.castShadow = true;
  group.add(leftFoot);

  // Right Leg
  createLimb('Right_Thigh_Mesh', 0.075, 0.058, 0.40, new THREE.Vector3(-0.12, 0.69, 0), new THREE.Euler(0, 0, 0));
  addJointBall(new THREE.Vector3(-0.12, 0.49, 0.01), 0.055);
  createLimb('Right_Calf_Mesh', 0.056, 0.044, 0.40, new THREE.Vector3(-0.12, 0.29, 0), new THREE.Euler(0, 0, 0));
  addJointBall(new THREE.Vector3(-0.12, 0.09, 0), 0.042);
  // Right Foot
  const rightFootGeo = new THREE.BoxGeometry(0.085, 0.06, 0.18);
  const rightFoot = new THREE.Mesh(rightFootGeo, jointsMat);
  rightFoot.name = 'Right_Foot_Mesh';
  rightFoot.position.set(-0.12, 0.03, 0.04);
  rightFoot.castShadow = true;
  group.add(rightFoot);

  return group;
}

/**
 * Creates Cyber Fighter model with a rigid weapon prop to demonstrate Rigid Prop Lock.
 */
export function createCyberFighterWithWeapon(): { group: THREE.Group; weaponMesh: THREE.Mesh } {
  const group = createStylizedHumanoid();
  group.name = 'CyberFighter';

  const weaponMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.6,
    roughness: 0.2,
    metalness: 0.8
  });

  const mergedWeaponGeo = new THREE.BoxGeometry(0.04, 1.0, 0.03);
  const weaponMesh = new THREE.Mesh(mergedWeaponGeo, weaponMat);
  weaponMesh.name = 'Rigid_Energy_Blade';
  weaponMesh.position.set(-0.80, 1.44, 0.15);
  weaponMesh.rotation.set(0.3, 0, -0.15);
  weaponMesh.castShadow = true;

  group.add(weaponMesh);

  return { group, weaponMesh };
}
