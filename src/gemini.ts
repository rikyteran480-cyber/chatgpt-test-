export type DocumentaryRequest = {
  topic: string;
  duration: 60 | 80 | 100;
  format: "9:16" | "16:9";
  previousWorks: Array<{ title: string; angle: string; summary: string }>;
};

export type DocumentaryResponse = {
  editorialAngle: string;
  editorialNote: string;
  noveltyCheck: string;
  hook: string;
  development: string;
  closing: string;
  estimatedSeconds: number;
  factsToVerify: string[];
  sources: Array<{ title: string; url: string; relevance: string }>;
  scenes: Array<{
    narration: string;
    visualDescription: string;
    imageType: string;
    prompt: string;
    duration: number;
  }>;
};

export async function generateDocumentary(input: DocumentaryRequest): Promise<DocumentaryResponse> {
  const endpoint = import.meta.env.VITE_GEMINI_API_URL as string | undefined;
  if (!endpoint) {
    throw new Error("Falta configurar el servicio de IA. Primero hay que publicar el backend seguro de Gemini.");
  }
  const response = await fetch(endpoint.replace(/\/$/, "") + "/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  const data = await response.json() as DocumentaryResponse & { error?: string };
  if (!response.ok) throw new Error(data.error || "El servicio de IA no pudo completar el documental.");
  if (!data.hook || !data.development || !data.closing || !Array.isArray(data.scenes)) {
    throw new Error("La respuesta de IA llegó incompleta. Inténtalo de nuevo.");
  }
  return data;
}
