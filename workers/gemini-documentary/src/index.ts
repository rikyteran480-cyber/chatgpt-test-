export interface Env {
  GEMINI_API_KEY: string;
  ALLOWED_ORIGIN?: string;
  GEMINI_MODEL?: string;
}

type RequestBody = {
  topic: string;
  duration?: 60 | 80 | 100;
  format?: "9:16" | "16:9";
  previousWorks?: Array<{ title?: string; angle?: string; summary?: string }>;
  preferredAngle?: string;
};

const SYSTEM_INSTRUCTION = `
Eres el motor editorial de RikyTech AI Studio, un estudio de documentales históricos breves en español.
Tu prioridad es producir documentales rigurosos, originales y narrativamente distintos, nunca una fábrica de textos repetidos.

REGLAS EDITORIALES OBLIGATORIAS:
1. Antes de escribir, identifica el enfoque narrativo más específico y menos obvio que pueda sostenerse con hechos. Evita el enfoque genérico de biografía cronológica si existe una pregunta histórica concreta mejor.
2. Lee la lista previousWorks como memoria editorial: NO reutilices su pregunta central, tesis, secuencia de argumentos, gancho, metáforas ni conclusión. Cambiar sinónimos o el título no cuenta como originalidad.
3. Si el tema ya fue tratado, propón un ángulo sustancialmente distinto. Si no hay un ángulo alternativo sólido, dilo en editorialNote y solicita aprobación en lugar de reciclar.
4. Nunca inventes hechos, citas, fechas, personajes, fuentes ni consenso académico. Distingue hechos documentados, hipótesis y controversias. No conviertas leyendas en hechos.
5. Usa búsqueda web para contrastar afirmaciones históricas. Prioriza museos, universidades, archivos, publicaciones académicas y fuentes primarias digitalizadas. Incluye URLs reales y títulos de fuentes consultadas. Si no puedes verificar algo, márcalo como pendiente.
6. Evita frases prefabricadas y comienzos repetitivos como “¿Sabías que...?”, “En el corazón de...” o “La historia que pocos conocen...”. Cada guion debe tener una entrada propia, concreta y vinculada a su ángulo.
7. Escribe en español natural, narración documental cinematográfica, ritmo ágil, sin instrucciones de cámara ni listas dentro del guion.
8. Ajusta la longitud al objetivo: aproximadamente 2.3 a 2.5 palabras por segundo en español. Devuelve gancho, desarrollo y cierre.
9. Genera escenas que sigan la narración. Distingue archivo/fotografía auténtica de reconstrucción IA; nunca describas una recreación como foto histórica real.
10. No afirmes que una imagen auténtica existe si no has localizado una fuente verificable.

Devuelve únicamente un objeto JSON válido con todos los campos solicitados: editorialAngle, editorialNote, noveltyCheck, hook, development, closing, estimatedSeconds, factsToVerify, sources y scenes. No incluyas Markdown ni texto fuera del JSON.
`;

function json(data: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "vary": "Origin"
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestOrigin = request.headers.get("Origin") ?? "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": allowedOrigin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "Content-Type",
        "vary": "Origin"
      }});
    }
    if (!env.ALLOWED_ORIGIN) return json({ error: "El backend aún no tiene configurado el origen permitido." }, 503, requestOrigin || "*");
    if (request.method !== "POST") return json({ error: "Método no permitido." }, 405, allowedOrigin);
    if (!env.GEMINI_API_KEY) return json({ error: "El servicio todavía no está configurado con una clave de Gemini." }, 503, allowedOrigin);
    if (env.ALLOWED_ORIGIN && requestOrigin !== env.ALLOWED_ORIGIN) return json({ error: "Origen no autorizado." }, 403, env.ALLOWED_ORIGIN);

    let body: RequestBody;
    try { body = await request.json() as RequestBody; }
    catch { return json({ error: "La solicitud no contiene JSON válido." }, 400, allowedOrigin); }

    const topic = String(body.topic ?? "").trim();
    if (topic.length < 3 || topic.length > 240) return json({ error: "Escribe un tema de entre 3 y 240 caracteres." }, 400, allowedOrigin);
    const duration = [60, 80, 100].includes(Number(body.duration)) ? Number(body.duration) : 80;
    const format = body.format === "16:9" ? "16:9" : "9:16";
    const previousWorks = Array.isArray(body.previousWorks) ? body.previousWorks.slice(0, 40) : [];

    const userPrompt = `
Crea un documental corto sobre este tema: "${topic}".
Duración objetivo: ${duration} segundos. Formato: ${format}.
Enfoque adicional solicitado: ${String(body.preferredAngle ?? "Elige el ángulo histórico más interesante y menos repetido.").slice(0, 500)}.

TRABAJOS ANTERIORES DEL CANAL (evita repetir sus ángulos y estructuras):
${JSON.stringify(previousWorks)}

Primero compara el tema con los trabajos anteriores, luego investiga y elige un enfoque diferente y defendible. Si no puedes encontrar un ángulo realmente distinto, explica el problema en editorialNote y no fabriques una falsa novedad.
Incluye fuentes con URL que respalden las afirmaciones centrales. Devuelve un guion dividido en gancho, desarrollo y cierre y escenas sincronizadas con ese texto.
`;

    try {
      const model = env.GEMINI_MODEL || "gemini-2.5-flash";
      const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.85 }
        })
      });
      const payload = await upstream.json() as any;
      if (!upstream.ok) {
        return json({ error: "Gemini no pudo generar el documental.", details: payload?.error?.message ?? "Error del proveedor." }, 502, allowedOrigin);
      }
      const text = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("");
      if (!text) return json({ error: "Gemini devolvió una respuesta vacía." }, 502, allowedOrigin);
      let result: unknown;
      try { result = JSON.parse(text); }
      catch { return json({ error: "La respuesta de Gemini no tuvo el formato esperado." }, 502, allowedOrigin); }
      return json(result, 200, allowedOrigin);
    } catch {
      return json({ error: "No se pudo conectar con el servicio de generación." }, 502, allowedOrigin);
    }
  }
};
