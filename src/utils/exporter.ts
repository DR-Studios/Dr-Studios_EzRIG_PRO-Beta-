import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export interface ExportOptions {
  binary?: boolean;
  embedImages?: boolean;
  truncateDrawRange?: boolean;
}

/**
 * Exports a skinned character root object to a downloadable GLB file.
 */
export function exportRiggedGLB(
  rootObject: THREE.Object3D,
  filename: string = 'Rigged_Character.glb',
  options: ExportOptions = { binary: true }
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const exporter = new GLTFExporter();
      exporter.parse(
        rootObject,
        (result) => {
          if (result instanceof ArrayBuffer) {
            saveArrayBufferAsFile(result, filename);
          } else {
            const output = JSON.stringify(result, null, 2);
            saveStringAsFile(output, filename.replace('.glb', '.gltf'));
          }
          resolve();
        },
        (error) => {
          console.error('GLTF Export Error:', error);
          reject(error);
        },
        {
          binary: options.binary !== false,
          embedImages: options.embedImages !== false,
          truncateDrawRange: options.truncateDrawRange !== false
        }
      );
    } catch (err) {
      reject(err);
    }
  });
}

function saveArrayBufferAsFile(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: 'model/gltf-binary' });
  triggerDownload(blob, filename);
}

function saveStringAsFile(text: string, filename: string) {
  const blob = new Blob([text], { type: 'application/json' });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}
