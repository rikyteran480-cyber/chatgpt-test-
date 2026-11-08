# RikyTech AI Studio

Estudio de producción audiovisual con IA, pensado primero para móvil y preparado para funcionar como aplicación web instalable y aplicación Android.

## Entorno de prueba público
Este repositorio es una copia temporal de pruebas de RikyTech AI Studio. El proyecto principal permanece en su repositorio privado.

## Estado
**Versión 0.7.0 — Importación y almacenamiento local de imágenes por escena.**

Incluye creación, edición, búsqueda y eliminación de proyectos; formato vertical/horizontal; duración objetivo de 60, 80 o 100 segundos; editor de narración con gancho, desarrollo y cierre; y planificador de escenas editable. Las imágenes importadas se guardan por escena en IndexedDB del dispositivo.

## Flujo visual con Google Flow
- Estilo predeterminado: fotografía hiperrealista cinematográfica.
- Prioriza fotografías, archivos y documentos históricos auténticos cuando existan.
- Para escenas históricas sin registro visual auténtico, usa reconstrucciones fotorrealistas generadas y etiquétalas como recreaciones.
- En cada escena de reconstrucción, el botón **Abrir Flow y copiar prompt** copia el prompt visual y abre Google Flow para que el usuario lo pegue y genere la imagen con Nano Banana.
- La generación se realiza en Flow, usando la cuenta y los límites diarios de Google del usuario. RikyTech no usa Picsart ni consume créditos de Picsart.
- Después de generar y descargar una imagen desde Flow, vuelve a RikyTech, abre la escena correspondiente y pulsa **Importar imagen desde el teléfono**. Selecciona la imagen descargada; aparecerá en la escena y quedará guardada localmente.
- También puedes importar fotografías auténticas. Cada escena admite una imagen, que puedes reemplazar o quitar. Límite de importación: 20 MB por imagen.
- Las imágenes se almacenan en IndexedDB, separadas de los datos del proyecto, para evitar llenar el almacenamiento de texto de localStorage. Permanecen en el mismo navegador/dispositivo; todavía no se sincronizan con la nube.

**Importante:** Flow permite crear imágenes desde su interfaz móvil, pero no hay una API pública oficial de Flow para que esta aplicación envíe prompts y reciba automáticamente las imágenes. Por eso la integración actual es un traspaso de prompt con un toque, no una automatización falsa ni una conexión no oficial.

## Ejecutar en desarrollo
Requiere Node.js 20 o superior.

```bash
npm install
npm run dev
```

## Compilar
```bash
npm run typecheck
npm run build
```

## Plataformas
- Web responsive y PWA.
- Android mediante Capacitor en una siguiente fase.

## Documentación
Consulta [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para conocer la arquitectura y las etapas de desarrollo.

## Principios
- Español como idioma inicial.
- Diseño mobile-first.
- Proyectos privados por defecto.
- No guardar claves de proveedores en el cliente.
- No realizar publicaciones, compras ni acciones con coste sin confirmación explícita.


## Generación documental con Gemini
Se añadió la primera integración de backend para generar guiones y escenas mediante Gemini con búsqueda web, referencias históricas y reglas editoriales de originalidad. El generador compara el tema con los proyectos previos enviados por el navegador y propone un enfoque diferente. La clave se guarda exclusivamente como secret en el backend.

- Reglas de originalidad: [docs/EDITORIAL_ORIGINALITY.md](docs/EDITORIAL_ORIGINALITY.md)
- Configuración del backend seguro: [docs/GEMINI_SETUP.md](docs/GEMINI_SETUP.md)
- Worker: `workers/gemini-documentary`

**Estado:** integración preparada en esta rama, pendiente de configurar y desplegar el Worker, configurar `VITE_GEMINI_API_URL` y ejecutar una prueba real. No está activa en la web publicada todavía.
