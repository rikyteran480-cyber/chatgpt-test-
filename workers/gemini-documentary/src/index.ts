export interface Env {
  GEMINI_API_KEY: string;
  GEMINI_API_KEY_2?: string;
  OPENROUTER_API_KEY?: string;
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

function extractJsonObject(raw: string): any {
  const text = raw.replace(/﻿/g, "").trim();
  const start = text.indexOf("{");
  if (start < 0) throw new Error("No se encontró un objeto JSON.");
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      const parsed = JSON.parse(text.slice(start, i + 1));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("La respuesta JSON no es un objeto.");
      return parsed;
    }
  }
  throw new Error("El objeto JSON llegó incompleto.");
}

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
    if (!env.GEMINI_API_KEY && !env.GEMINI_API_KEY_2) return json({ error: "El servicio todavía no está configurado con una clave de Gemini." }, 503, allowedOrigin);
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

    const model = "gemini-3.8-flash";
    const hasPrimaryKey = Boolean(env.GEMINI_API_KEY);
    const hasBackupKey = Boolean(env.GEMINI_API_KEY_2);
    const keys = [env.GEMINI_API_KEY, env.GEMINI_API_KEY_2].filter((key): key is string => Boolean(key));
    let lastQuotaMessage = "";
    for (let index = 0; index < keys.length; index++) {
      try {
        const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": keys[index] },
          body: JSON.stringify({
            model,
            input: SYSTEM_INSTRUCTION + "\n\n" + userPrompt,
            tools: [{ type: "google_search" }]
          })
        });
        const payload = await upstream.json() as any;
        if (!upstream.ok) {
          const providerMessage = String(payload?.error?.message ?? payload?.message ?? "Error del proveedor.");
          const quotaError = upstream.status === 429 || /quota|rate.?limit|resource.?exhausted|billing.*limit/i.test(providerMessage);
          if (quotaError) {
            lastQuotaMessage = providerMessage;
            if (index < keys.length - 1) continue;
            break;
          }
          const detail = index === 1
            ? "La primera cuenta agotó su cuota y la segunda también falló: "
            : "Gemini no pudo generar el documental: ";
          return json({ error: detail + providerMessage.slice(0, 400) }, 502, allowedOrigin);
        }
        const output = typeof payload?.output_text === "string"
          ? payload.output_text
          : (payload?.steps ?? []).flatMap((step: any) => step?.content ?? []).filter((item: any) => item?.type === "text").map((item: any) => item.text ?? "").join("");
        if (!output) return json({ error: "Gemini devolvió una respuesta vacía mediante Interactions API." }, 502, allowedOrigin);
        try {
          const cleaned = output.replace(/```(?:json)?/gi, "").trim();
          const jsonStart = cleaned.indexOf("{");
          const jsonEnd = cleaned.lastIndexOf("}");
          if (jsonStart < 0 || jsonEnd <= jsonStart) throw new Error("No se encontró un objeto JSON.");
          return json(JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)), 200, allowedOrigin);
        } catch {
          return json({ error: "Gemini respondió, pero el formato del documental no se pudo interpretar. Inténtalo otra vez." }, 502, allowedOrigin);
        }
      } catch {
        if (index === keys.length - 1) return json({ error: "No se pudo conectar con el servicio de generación." }, 502, allowedOrigin);
      }
    }
    if (env.OPENROUTER_API_KEY) {
      try {
        const fallbackPrompt = SYSTEM_INSTRUCTION + "\n\n" + userPrompt + "\n\nIMPORTANTE: No tienes búsqueda web en tiempo real. No afirmes que consultaste fuentes ahora. No inventes URLs ni referencias: incluye solo enlaces que conozcas con alta confianza; de lo contrario deja sources vacío y añade los datos no confirmados a factsToVerify. Indica en editorialNote que el borrador requiere verificación documental antes de publicarse.";
        const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", "authorization": "Bearer " + env.OPENROUTER_API_KEY, "http-referer": "https://rikyteran480-cyber.github.io/chatgpt-test-/", "x-title": "RikyTech AI Studio" },
          body: JSON.stringify({ model: "openrouter/free", messages: [{ role: "user", content: fallbackPrompt }], response_format: { type: "json_object" }, temperature: 0.3, max_tokens: 9000 })
        });
        const payload = await upstream.json() as any;
        if (!upstream.ok) {
          const message = String(payload?.error?.message ?? "OpenRouter no pudo completar la solicitud.");
          return json({ error: "Gemini agotó sus cuotas y OpenRouter también falló: " + message.slice(0, 350) }, 502, allowedOrigin);
        }
        const rawContent = payload?.choices?.[0]?.message?.content;
        const output = Array.isArray(rawContent) ? rawContent.map((part: any) => typeof part === "string" ? part : part?.text ?? "").join("\\n") : rawContent;
        if (typeof output !== "string" || !output.trim()) return json({ error: "OpenRouter respondió sin contenido. Inténtalo de nuevo." }, 502, allowedOrigin);
        try {
          const result = extractJsonObject(output);
          result.editorialNote = [result.editorialNote, "Proveedor alternativo OpenRouter: este borrador no tuvo búsqueda web en tiempo real. Verifica las fuentes y afirmaciones antes de publicar."].filter(Boolean).join(" ");
          result.sources = Array.isArray(result.sources) ? result.sources : [];
          result.factsToVerify = Array.isArray(result.factsToVerify) ? result.factsToVerify : [];
          return json(result, 200, allowedOrigin);
        } catch {
          return json({ error: "OpenRouter generó texto, pero no se pudo interpretar como documental estructurado. Inténtalo otra vez." }, 502, allowedOrigin);
        }
      } catch {
        return json({ error: "Gemini agotó sus cuotas y no se pudo conectar con OpenRouter." }, 502, allowedOrigin);
      }
    }
    return json({ error: hasPrimaryKey && hasBackupKey ? "Las dos cuentas de Gemini agotaron su cuota y no hay una clave OPENROUTER_API_KEY configurada en Producción. " + lastQuotaMessage.slice(0, 250) : "No hay un proveedor alternativo configurado. Añade OPENROUTER_API_KEY en Cloudflare Production." }, 429, allowedOrigin);

  }
};
