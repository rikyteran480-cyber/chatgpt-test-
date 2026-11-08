# Configurar el motor Gemini de RikyTech

La interfaz de GitHub Pages es estática. La clave de Gemini no puede guardarse en el navegador ni en el repositorio. El proyecto incluye un backend Cloudflare Worker independiente.

## 1. Crear una clave
1. Abre Google AI Studio: https://aistudio.google.com/app/apikey
2. Crea una API key para Gemini.
3. No la pegues en archivos del proyecto, GitHub Pages, chats ni en `.env` del frontend.

## 2. Publicar el backend
Desde un entorno con Node.js y Wrangler:
1. Entra en `workers/gemini-documentary`.
2. Configura `ALLOWED_ORIGIN` en `wrangler.toml` con el origen exacto del sitio publicado, por ejemplo `https://TU-USUARIO.github.io`.
3. Ejecuta `npx wrangler secret put GEMINI_API_KEY` y pega la clave cuando Wrangler la solicite.
4. Ejecuta `npx wrangler deploy`.
5. Copia la URL `*.workers.dev` que entrega Cloudflare.

## 3. Configurar el frontend
Añade la variable de compilación `VITE_GEMINI_API_URL` con la URL del Worker, sin añadir `/generate`. Vuelve a compilar y publicar GitHub Pages.

## Seguridad y costes
- La clave permanece como secret en el backend.
- Restringe el origen permitido y configura límites de uso/cuotas en Google AI Studio y Cloudflare antes de compartir públicamente.
- No existe un límite de coste automático implementado por esta aplicación.
- El servicio usa Gemini con Google Search grounding para contrastar hechos y devuelve fuentes, ángulo editorial y escenas estructuradas.
- La lista de trabajos previos se envía desde el navegador del usuario. Aún no hay una base de datos compartida para recordar el catálogo en distintos dispositivos.
- La función no se considera operativa hasta desplegar el Worker, configurar la URL y verificar una generación real.
