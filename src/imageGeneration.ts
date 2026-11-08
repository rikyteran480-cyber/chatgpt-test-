const IMAGE_ENDPOINT = import.meta.env.VITE_IMAGE_GENERATION_URL as string | undefined;

export async function generateSceneImage(input: { prompt: string; format: '9:16' | '16:9'; sceneId: string }): Promise<Blob> {
  if (!IMAGE_ENDPOINT) {
    throw new Error('No hay un proveedor de imágenes configurado.');
  }
  const response = await fetch(IMAGE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || 'El proveedor de imágenes respondió con un error (' + response.status + ').');
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.startsWith('image/')) return response.blob();
  const result = await response.json() as { imageBase64?: string; mimeType?: string; error?: string };
  if (!result.imageBase64) throw new Error(result.error || 'El proveedor no devolvió una imagen válida.');
  const binary = atob(result.imageBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: result.mimeType || 'image/png' });
}
