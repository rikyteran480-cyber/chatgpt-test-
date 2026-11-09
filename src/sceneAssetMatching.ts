export type SceneAssetTarget = {
  id: string;
  imageType: string;
};

export type SceneImageAssignment = {
  file: File;
  scene: SceneAssetTarget;
  matchType: 'scene-number' | 'filename-order';
};

function extractSceneNumber(filename: string): number | null {
  const match = filename.match(/(?:escena|scene|shot|frame)[\s_-]*0*(\d+)/i);
  return match ? Number(match[1]) : null;
}

/**
 * Match downloaded images to documentary scenes.
 * Explicit names such as escena-03.png always win; remaining files are
 * assigned in natural filename order to the remaining AI reconstruction scenes.
 */
export function matchSceneImageFiles(
  files: File[],
  scenes: SceneAssetTarget[],
): SceneImageAssignment[] {
  const targets = scenes
    .map((scene, index) => ({ scene, sceneNumber: index + 1 }))
    .filter(({ scene }) => scene.imageType === 'Reconstrucción IA fotorrealista');
  const ordered = [...files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  );
  const assignments: SceneImageAssignment[] = [];
  const usedFiles = new Set<File>();
  const usedScenes = new Set<string>();

  for (const file of ordered) {
    const number = extractSceneNumber(file.name);
    if (number === null) continue;
    const target = targets.find((item) => item.sceneNumber === number);
    if (!target || usedScenes.has(target.scene.id)) continue;
    assignments.push({ file, scene: target.scene, matchType: 'scene-number' });
    usedFiles.add(file);
    usedScenes.add(target.scene.id);
  }

  const remainingTargets = targets.filter(({ scene }) => !usedScenes.has(scene.id));
  const remainingFiles = ordered.filter((file) => !usedFiles.has(file));
  for (let index = 0; index < Math.min(remainingTargets.length, remainingFiles.length); index += 1) {
    assignments.push({
      file: remainingFiles[index],
      scene: remainingTargets[index].scene,
      matchType: 'filename-order',
    });
  }

  return assignments.sort((a, b) =>
    scenes.findIndex((scene) => scene.id === a.scene.id) -
    scenes.findIndex((scene) => scene.id === b.scene.id),
  );
}
