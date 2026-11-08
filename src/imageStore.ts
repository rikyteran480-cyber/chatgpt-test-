const DB_NAME = 'rikytech-ai-studio.media';
const STORE_NAME = 'scene-images';
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB no está disponible en este navegador.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento local.'));
  });
}

export async function saveSceneImage(sceneId: string, file: Blob): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(file, sceneId);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error('No se pudo guardar la imagen.')); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('Se canceló el guardado de la imagen.')); };
  });
}

export async function getSceneImage(sceneId: string): Promise<Blob | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(sceneId);
    request.onsuccess = () => { const result = (request.result as Blob | undefined) ?? null; db.close(); resolve(result); };
    request.onerror = () => { db.close(); reject(request.error ?? new Error('No se pudo recuperar la imagen.')); };
  });
}

export async function deleteSceneImage(sceneId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(sceneId);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error('No se pudo quitar la imagen.')); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('Se canceló la eliminación.')); };
  });
}
