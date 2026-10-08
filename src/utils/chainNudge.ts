import * as THREE from 'three';
import { JointRecord } from '../types/rig';
import { SYMMETRIC_PAIRS } from './anthropometry';

/**
 * Finds all descendant joint IDs in the skeleton hierarchy for a given parent joint.
 */
export function getDescendantJointIds(jointId: string, jointRecords: Map<string, JointRecord>): string[] {
  const descendants: string[] = [];
  const queue = [jointId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [id, rec] of jointRecords.entries()) {
      if (rec.parentId === current && !descendants.includes(id)) {
        descendants.push(id);
        queue.push(id);
      }
    }
  }

  return descendants;
}

/**
 * Applies a relative rotation offset to a joint and its downstream child chain.
 * pivot: pivot joint whose position is the center of rotation.
 * angles: { pitchDeg, yawDeg, rollDeg }
 */
export function nudgeJointChain(
  pivotJointId: string,
  angles: { pitchDeg?: number; yawDeg?: number; rollDeg?: number },
  jointRecords: Map<string, JointRecord>,
  applySymmetry: boolean = true
): Map<string, JointRecord> {
  const result = new Map<string, JointRecord>();
  for (const [id, rec] of jointRecords.entries()) {
    result.set(id, { ...rec, positionModelSpace: [...rec.positionModelSpace] });
  }

  const pivotRec = result.get(pivotJointId);
  if (!pivotRec) return result;

  const pivotPos = new THREE.Vector3(...pivotRec.positionModelSpace);
  const childIds = getDescendantJointIds(pivotJointId, result);

  if (childIds.length === 0) return result;

  // Euler rotation from deg
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(angles.pitchDeg ?? 0),
    THREE.MathUtils.degToRad(angles.yawDeg ?? 0),
    THREE.MathUtils.degToRad(angles.rollDeg ?? 0),
    'XYZ'
  );

  const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(euler);

  // Rotate each child relative to pivot
  for (const cId of childIds) {
    const cRec = result.get(cId)!;
    const v = new THREE.Vector3(...cRec.positionModelSpace);
    v.sub(pivotPos);
    v.applyMatrix4(rotMatrix);
    v.add(pivotPos);
    cRec.positionModelSpace = [v.x, v.y, v.z];
    cRec.userEdited = true;
    cRec.source = 'manual';
  }

  // Sagittal symmetry mirroring
  if (applySymmetry) {
    const pairPivotId = SYMMETRIC_PAIRS[pivotJointId];
    if (pairPivotId && result.has(pairPivotId)) {
      const pairPivotRec = result.get(pairPivotId)!;
      const pairPivotPos = new THREE.Vector3(...pairPivotRec.positionModelSpace);
      const pairChildIds = getDescendantJointIds(pairPivotId, result);

      // Inverted rotation for mirror symmetry
      const mirrorEuler = new THREE.Euler(
        THREE.MathUtils.degToRad(angles.pitchDeg ?? 0),
        THREE.MathUtils.degToRad(-(angles.yawDeg ?? 0)),
        THREE.MathUtils.degToRad(-(angles.rollDeg ?? 0)),
        'XYZ'
      );
      const mirrorRotMatrix = new THREE.Matrix4().makeRotationFromEuler(mirrorEuler);

      for (const pCId of pairChildIds) {
        const pCRec = result.get(pCId)!;
        const v = new THREE.Vector3(...pCRec.positionModelSpace);
        v.sub(pairPivotPos);
        v.applyMatrix4(mirrorRotMatrix);
        v.add(pairPivotPos);
        pCRec.positionModelSpace = [v.x, v.y, v.z];
        pCRec.userEdited = true;
        pCRec.source = 'manual';
      }
    }
  }

  return result;
}
