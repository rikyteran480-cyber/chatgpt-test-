# Auditoría de reutilización de proyectos de producción audiovisual

Fecha de revisión: 2026-11-09

## Decisión

Mantener RikyTech AI Studio como aplicación principal. Reutilizar patrones y arquitectura de proyectos externos, no trasladar sus entornos completos al navegador Android.

## Referencias examinadas

### AI Video Factory — MIT

Repositorio: https://github.com/summitsingh/ai-video-factory

Aporta ideas útiles: pipeline por etapas, escenas como unidades de trabajo, reutilización de resultados, control de calidad, narración, subtítulos y ensamblado. Su implementación requiere Python 3.12, uv, FFmpeg y un endpoint compatible de chat; sus imágenes locales de difusión requieren modelos descargados y entorno de ejecución con recursos de cómputo. Por tanto, no es una dependencia ejecutable dentro de nuestra PWA móvil.

Decisión: adoptar el enfoque de pipeline por escenas y estado explícito. No copiar el proyecto completo ni incorporar sus dependencias Python a la aplicación web.

### OpenMontage — AGPL-3.0

Repositorio: https://github.com/OpenMontageInc/OpenMontage

Ofrece ideas de storyboard, aprobación por escena, proveedores intercambiables, trabajos asíncronos y seguimiento de costos. El propio proyecto requiere un agente de programación y entorno local con Node/Python/FFmpeg; algunas rutas de generación usan proveedores de pago.

Decisión: tomar inspiración arquitectónica, pero no copiar código AGPL en RikyTech sin una decisión explícita de adoptar las obligaciones de esa licencia. Mantener proveedores de pago desactivados por defecto y nunca asumir coste cero cuando el proveedor no publica una tarifa.

## Cambio implementado en RikyTech

Se añadió `src/sceneAssetMatching.ts` y se integró en la importación por lotes de `src/App.tsx`.

- Reconoce números explícitos en nombres como `escena-03.png`, `scene_03.jpg`, `shot-03.webp` y `frame 03.png`.
- Asigna esos archivos al número real de escena del proyecto, incluso cuando hay escenas de archivo auténtico intercaladas.
- Asigna archivos sin número explícito a las escenas IA restantes en orden natural del nombre.
- Evita asignar dos archivos al mismo destino.
- Informa cuántas imágenes se importaron y cuántas escenas quedan pendientes.

## Límites que permanecen

- Google Flow no ofrece una API pública oficial verificada para enviar prompts y recibir imágenes directamente desde RikyTech.
- La generación automática en lote dentro de RikyTech sigue sin estar disponible.
- La generación secuencial mediante `VITE_IMAGE_GENERATION_URL` requiere un proveedor de imágenes real; el código cliente por sí solo no crea ese servicio.
- Las imágenes se guardan en IndexedDB del dispositivo/navegador y no se sincronizan a la nube.
- Esta actualización no se ha compilado ni probado en un navegador Android. Debe pasar `npm run typecheck` y `npm run build` antes de considerarse validada.

## Siguiente etapa recomendada

Construir una cola de producción por escenas con estados pendientes/en proceso/completadas/error, reintento por escena y manifiesto de archivos. La generación real debe conectarse solo a un proveedor cuya API, permisos, límites y costes estén verificados, sin claves privadas en el cliente.
