import * as THREE from 'three';
import { JointRecord, RigidPropLock } from '../types/rig';

export interface SkinBindingResult {
  skeleton: THREE.Skeleton;
  rootBone: THREE.Bone;
  boneMap: Map<string, THREE.Bone>;
  skinnedMeshes: THREE.SkinnedMesh[];
  boneList: THREE.Bone[];
}

/**
 * Builds a THREE.Bone hierarchy from JointRecord map.
 * Each child bone's position is parent-relative.
 */
export function buildBoneHierarchy(jointRecords: Map<string, JointRecord>): {
  rootBone: THREE.Bone;
  boneMap: Map<string, THREE.Bone>;
  boneList: THREE.Bone[];
} {
  const boneMap = new Map<string, THREE.Bone>();
  const boneList: THREE.Bone[] = [];

  // Create THREE.Bone objects
  for (const [id, record] of jointRecords.entries()) {
    const bone = new THREE.Bone();
    bone.name = record.name;
    bone.userData = { id, record };
    boneMap.set(id, bone);
    boneList.push(bone);
  }

  // Find root bone (parentId === null or pelvis)
  let rootBone: THREE.Bone | null = null;
  for (const [id, record] of jointRecords.entries()) {
    if (!record.parentId || !jointRecords.has(record.parentId)) {
      rootBone = boneMap.get(id)!;
      break;
    }
  }

  if (!rootBone) {
    rootBone = boneMap.get('pelvis') || boneList[0];
  }

  // Establish parent-child links and parent-relative positions
  for (const [id, record] of jointRecords.entries()) {
    const bone = boneMap.get(id)!;
    const worldPos = new THREE.Vector3(...record.positionModelSpace);

    if (record.parentId && boneMap.has(record.parentId)) {
      const parentBone = boneMap.get(record.parentId)!;
      const parentRecord = jointRecords.get(record.parentId)!;
      const parentWorldPos = new THREE.Vector3(...parentRecord.positionModelSpace);

      // Parent-relative offset
      bone.position.copy(worldPos.clone().sub(parentWorldPos));
      parentBone.add(bone);
    } else {
      // Root bone is placed at its world position
      bone.position.copy(worldPos);
    }
  }

  // Update world matrix recursively
  rootBone.updateMatrixWorld(true);

  return { rootBone, boneMap, boneList };
}

/**
 * Binds meshes to the skeleton with strict Sagittal Plane Separation (x * bone_x >= 0)
 * and top-4 normalized influences per vertex.
 */
export function bindMeshesToSkeleton(
  sourceRoot: THREE.Object3D,
  jointRecords: Map<string, JointRecord>,
  rigidProps: RigidPropLock[] = [],
  sagittalSeparation: boolean = true
): SkinBindingResult {
  const { rootBone, boneMap, boneList } = buildBoneHierarchy(jointRecords);
  const skeleton = new THREE.Skeleton(boneList);

  // Map bone index
  const boneIndexMap = new Map<string, number>();
  boneList.forEach((bone, index) => {
    const id = bone.userData.id;
    if (id) boneIndexMap.set(id, index);
  });

  // Extract bone world positions for distance calculation
  const boneWorldPositions = boneList.map(bone => {
    const pos = new THREE.Vector3();
    bone.getWorldPosition(pos);
    return {
      bone,
      pos,
      name: bone.name,
      id: bone.userData.id as string
    };
  });

  const skinnedMeshes: THREE.SkinnedMesh[] = [];

  // Traverse and convert meshes to SkinnedMesh
  const meshesToConvert: THREE.Mesh[] = [];
  sourceRoot.traverse(child => {
    if ((child as THREE.Mesh).isMesh && !(child as THREE.SkinnedMesh).isSkinnedMesh) {
      meshesToConvert.push(child as THREE.Mesh);
    }
  });

  for (const mesh of meshesToConvert) {
    const geometry = mesh.geometry.clone();
    // Ensure non-indexed geometry is indexed or has position attribute
    const positionAttr = geometry.getAttribute('position');
    if (!positionAttr) continue;

    const vertexCount = positionAttr.count;
    const skinIndices: number[] = [];
    const skinWeights: number[] = [];

    // Check if this mesh is locked as a rigid prop
    const rigidLock = rigidProps.find(p => p.meshUuid === mesh.uuid || p.meshName === mesh.name);
    const rigidBoneIndex = rigidLock ? boneIndexMap.get(rigidLock.boneId) ?? 0 : null;

    const vPos = new THREE.Vector3();
    const meshMatrixWorld = mesh.matrixWorld;

    for (let i = 0; i < vertexCount; i++) {
      vPos.fromBufferAttribute(positionAttr, i);
      vPos.applyMatrix4(meshMatrixWorld); // Model-space / world-space position

      if (rigidBoneIndex !== null) {
        // 100% rigid lock to single bone
        skinIndices.push(rigidBoneIndex, 0, 0, 0);
        skinWeights.push(1.0, 0.0, 0.0, 0.0);
        continue;
      }

      // Compute influence from each bone
      const influences: { boneIndex: number; weight: number }[] = [];

      for (let bIdx = 0; bIdx < boneWorldPositions.length; bIdx++) {
        const b = boneWorldPositions[bIdx];
        const isLeftBone = b.id.startsWith('left_') || b.name.includes('Left');
        const isRightBone = b.id.startsWith('right_') || b.name.includes('Right');

        // Sagittal Plane Separation:
        // Vertices with x > 0.01 cannot bind to Right bones
        // Vertices with x < -0.01 cannot bind to Left bones
        if (sagittalSeparation) {
          if (isLeftBone && vPos.x < -0.01) {
            continue; // strict separation
          }
          if (isRightBone && vPos.x > 0.01) {
            continue; // strict separation
          }
        }

        const dist = vPos.distanceTo(b.pos);
        // Inverse-distance weighting with epsilon and falloff power 2.5
        const w = 1.0 / Math.pow(dist + 0.02, 2.5);
        influences.push({ boneIndex: bIdx, weight: w });
      }

      // Sort descending by weight
      influences.sort((a, b) => b.weight - a.weight);

      // Top 4 influences
      const top4 = influences.slice(0, 4);
      let totalWeight = 0;
      for (const inf of top4) {
        totalWeight += inf.weight;
      }

      if (totalWeight > 0) {
        const ind = [0, 0, 0, 0];
        const wgt = [0, 0, 0, 0];
        for (let k = 0; k < 4; k++) {
          if (k < top4.length) {
            ind[k] = top4[k].boneIndex;
            wgt[k] = top4[k].weight / totalWeight; // Normalize strictly to 1.0
          } else {
            ind[k] = 0;
            wgt[k] = 0;
          }
        }
        skinIndices.push(...ind);
        skinWeights.push(...wgt);
      } else {
        // Fallback to root pelvis
        const pelvisIdx = boneIndexMap.get('pelvis') ?? 0;
        skinIndices.push(pelvisIdx, 0, 0, 0);
        skinWeights.push(1.0, 0.0, 0.0, 0.0);
      }
    }

    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    // Clone materials to prevent shared mutation
    let mat = mesh.material;
    if (Array.isArray(mat)) {
      mat = mat.map(m => m.clone());
    } else if (mat) {
      mat = mat.clone();
    }

    const skinnedMesh = new THREE.SkinnedMesh(geometry, mat);
    skinnedMesh.name = mesh.name || 'Skinned_Mesh';
    skinnedMesh.position.copy(mesh.position);
    skinnedMesh.rotation.copy(mesh.rotation);
    skinnedMesh.scale.copy(mesh.scale);
    skinnedMesh.castShadow = mesh.castShadow;
    skinnedMesh.receiveShadow = mesh.receiveShadow;

    // Attach rootBone to parent of mesh or to sourceRoot
    mesh.parent?.add(rootBone);
    skinnedMesh.add(rootBone);
    skinnedMesh.bind(skeleton);

    // Replace original mesh in parent
    const parent = mesh.parent;
    if (parent) {
      parent.remove(mesh);
      parent.add(skinnedMesh);
    }

    skinnedMeshes.push(skinnedMesh);
  }

  return { skeleton, rootBone, boneMap, skinnedMeshes, boneList };
}
