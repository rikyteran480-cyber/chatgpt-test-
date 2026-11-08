import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Clapperboard, FileText, Images, Film, Settings, Plus, Smartphone, ExternalLink, Menu, X, Search, FolderOpen, Trash2, Pencil, ArrowLeft, Clock3, Play, Save, Upload, Image as ImageIcon, XCircle, WandSparkles } from 'lucide-react';
import { deleteSceneImage, getSceneImage, saveSceneImage } from './imageStore';
import { generateDocumentary } from './gemini';
import { generateSceneImage } from './imageGeneration';

const DEFAULT_VISUAL_STYLE = 'Fotografía hiperrealista cinematográfica' as const;

function buildScenesFromScript(script: { hook: string; development: string; closing: string }, format: '9:16' | '16:9'): Scene[] {
  const sections = [
    { label: 'Gancho', text: script.hook ?? '' },
    { label: 'Desarrollo', text: script.development ?? '' },
    { label: 'Cierre', text: script.closing ?? '' },
  ];
  const chunks: { section: string; text: string }[] = [];
  for (const part of sections) {
    const sentences = part.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
    let buffer = '';
    for (const sentence of sentences.map((value) => value.trim()).filter(Boolean)) {
      buffer = buffer ? buffer + ' ' + sentence : sentence;
      if (buffer.split(/\\s+/).length >= 22) {
        chunks.push({ section: part.label, text: buffer });
        buffer = '';
      }
    }
    if (buffer) chunks.push({ section: part.label, text: buffer });
  }
  return chunks.map((chunk) => {
    const words = chunk.text.split(/\\s+/).length;
    const duration = Math.max(3, Math.min(8, Math.round(words / 2.35)));
    return {
      id: crypto.randomUUID(),
      narration: chunk.text,
      visualDescription: chunk.section + ': reconstrucción histórica fotorrealista del momento narrado; respetar época, vestuario, arquitectura, geografía y materiales documentados.',
      imageType: 'Reconstrucción IA fotorrealista',
      prompt: 'Fotografía hiperrealista cinematográfica para documental histórico. Representar visualmente: ' + chunk.text + ' Contexto histórico riguroso, época y materiales auténticos, iluminación natural, composición documental, formato ' + format + '. No incluir texto, letras, marcas de agua ni elementos modernos.',
      duration,
    };
  });
}


type Scene = {
  id: string;
  narration: string;
  visualDescription: string;
  imageType: 'Archivo o fotografía auténtica' | 'Reconstrucción IA fotorrealista';
  prompt: string;
  duration: number;
};

type Project = {
  id: string;
  name: string;
  description: string;
  format: '9:16' | '16:9';
  status: 'Idea' | 'En desarrollo' | 'Terminado';
  createdAt: string;
  updatedAt: string;
  duration: 60 | 80 | 100;
  visualStyle: typeof DEFAULT_VISUAL_STYLE;
  scenes?: Scene[];
  script: { hook: string; development: string; closing: string };
  editorialAngle?: string;
  editorialNote?: string;
  sources?: Array<{ title: string; url: string; relevance: string }>;
};

const STORAGE_KEY = 'rikytech-ai-studio.projects.v1';
const stages = [
  { icon: FileText, title: 'Guion', detail: 'Investiga y escribe la narración', status: 'En desarrollo' },
  { icon: Images, title: 'Escenas', detail: 'Planifica tomas documentales y prompts visuales', status: 'Disponible' },
  { icon: WandSparkles, title: 'Recursos IA', detail: 'Imágenes, voz y clips', status: 'Planificado' },
  { icon: Film, title: 'Montaje', detail: 'Ordena, musicaliza y subtitula', status: 'Planificado' },
];

function loadProjects(): Project[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as Project[]).map((project) => ({ ...project, duration: project.duration ?? 80, visualStyle: project.visualStyle ?? DEFAULT_VISUAL_STYLE, scenes: project.scenes ?? [], script: project.script ?? { hook: '', development: '', closing: '' } })) : [];
  } catch {
    return [];
  }
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>(loadProjects);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [selected, setSelected] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<'9:16' | '16:9'>('9:16');
  const [status, setStatus] = useState<Project['status']>('Idea');
  const [duration, setDuration] = useState<60 | 80 | 100>(80);
  const [sceneImageUrls, setSceneImageUrls] = useState<Record<string, string>>({});
  const [sceneImageErrors, setSceneImageErrors] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [manualPromptCopied, setManualPromptCopied] = useState(false);
  const [flowBatchStatus, setFlowBatchStatus] = useState('');
  const [flowImportStatus, setFlowImportStatus] = useState('');
  const [imageBatchStatus, setImageBatchStatus] = useState('');
  const [imageBatchRunning, setImageBatchRunning] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); } catch { /* Storage may be disabled or full. */ }
  }, [projects]);

  useEffect(() => {
    let cancelled = false;
    const urls: Record<string, string> = {};
    async function restoreImages() {
      if (!selected) { setSceneImageUrls({}); return; }
      await Promise.all((selected.scenes ?? []).map(async (scene) => {
        try {
          const blob = await getSceneImage(scene.id);
          if (blob) urls[scene.id] = URL.createObjectURL(blob);
        } catch { /* An unavailable local image does not block the project. */ }
      }));
      if (cancelled) { Object.values(urls).forEach(URL.revokeObjectURL); return; }
      setSceneImageUrls(urls);
    }
    void restoreImages();
    return () => { cancelled = true; Object.values(urls).forEach(URL.revokeObjectURL); };
  }, [selected?.id]);

  const filteredProjects = useMemo(() => projects
    .filter((project) => project.name.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [projects, search]);

  function openCreate() {
    setEditing(null); setName(''); setDescription(''); setFormat('9:16'); setStatus('Idea'); setDuration(80); setShowCreate(true);
  }

  function openEdit(project: Project) {
    setEditing(project); setName(project.name); setDescription(project.description); setFormat(project.format); setStatus(project.status); setDuration(project.duration ?? 80); setShowCreate(true);
  }

  function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const now = new Date().toISOString();
    if (editing) {
      const updated = { ...editing, name: name.trim(), description: description.trim(), format, status, duration, updatedAt: now };
      setProjects((items) => items.map((item) => item.id === editing.id ? updated : item));
      if (selected?.id === editing.id) setSelected(updated);
    } else {
      const created: Project = { id: crypto.randomUUID(), name: name.trim(), description: description.trim(), format, status, duration, visualStyle: DEFAULT_VISUAL_STYLE, script: { hook: '', development: '', closing: '' }, createdAt: now, updatedAt: now };
      setProjects((items) => [created, ...items]);
      setSelected(created);
    }
    setShowCreate(false);
  }

  function updateScript(field: 'hook' | 'development' | 'closing', value: string) {
    if (!selected) return;
    const updated: Project = { ...selected, script: { ...selected.script, [field]: value }, updatedAt: new Date().toISOString() };
    setSelected(updated);
    setProjects((items) => items.map((item) => item.id === selected.id ? updated : item));
  }


  function openFlowForScene(scene: Scene) {
    if (scene.imageType !== 'Reconstrucción IA fotorrealista') return;
    void navigator.clipboard?.writeText(scene.prompt);
    window.open('https://labs.google/fx/tools/flow', '_blank', 'noopener,noreferrer');
  }
  async function prepareFlowBatch() {
    if (!selected) return;
    const scenes = (selected.scenes ?? []).filter((scene) => scene.imageType === 'Reconstrucción IA fotorrealista');
    if (!scenes.length) {
      setFlowBatchStatus('No hay escenas de reconstrucción IA para enviar a Flow.');
      return;
    }
    const batch = [
      'RIKYTECH AI STUDIO — LOTE DE PROMPTS PARA GOOGLE FLOW',
      'Proyecto: ' + selected.name,
      'Formato: ' + selected.format,
      'Instrucción: genera cada escena por separado y conserva el número de escena para importar cada imagen en su lugar.',
      '',
      ...scenes.flatMap((scene) => {
        const index = (selected.scenes ?? []).findIndex((item) => item.id === scene.id) + 1;
        return ['========== ESCENA ' + String(index).padStart(2, '0') + ' ==========',
          'NARRACIÓN: ' + scene.narration,
          'PROMPT: ' + scene.prompt,
          ''];
      })
    ].join('\n');
    window.open('https://labs.google/fx/tools/flow', '_blank', 'noopener,noreferrer');
    try {
      await navigator.clipboard.writeText(batch);
      setFlowBatchStatus(scenes.length + ' prompts copiados. En Flow, genera cada escena por separado y luego vuelve aquí para importar las imágenes en sus tarjetas.');
    } catch {
      setFlowBatchStatus('Flow se abrió, pero no se pudo copiar el lote. Usa «Copiar prompt» en cada escena.');
    }
  }

  async function importFlowBatchImages(files: FileList | null) {
    if (!selected || !files?.length) return;
    const targets = (selected.scenes ?? []).filter((scene) => scene.imageType === 'Reconstrucción IA fotorrealista');
    const orderedFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    if (!orderedFiles.length) {
      setFlowImportStatus('No se encontraron archivos de imagen válidos.');
      return;
    }
    if (orderedFiles.some((file) => file.size > 20 * 1024 * 1024)) {
      setFlowImportStatus('Hay imágenes que superan el límite de 20 MB. Reduce su tamaño e inténtalo de nuevo.');
      return;
    }
    const count = Math.min(targets.length, orderedFiles.length);
    let imported = 0;
    for (let i = 0; i < count; i += 1) {
      try {
        if (await importSceneImage(targets[i].id, orderedFiles[i])) imported += 1;
      } catch { /* importSceneImage reports per-image errors */ }
    }
    const extra = orderedFiles.length > targets.length ? ' Sobran ' + (orderedFiles.length - targets.length) + ' archivo(s).' : '';
    const missing = orderedFiles.length < targets.length ? ' Faltan ' + (targets.length - orderedFiles.length) + ' imagen(es) para completar el lote.' : '';
    setFlowImportStatus(imported + ' de ' + count + ' imágenes importadas y asignadas en orden de nombre a las escenas.' + extra + missing);
  }

  async function generateAllSceneImages() {
    if (!selected || imageBatchRunning) return;
    const targets = (selected.scenes ?? []).filter((scene) =>
      scene.imageType === 'Reconstrucción IA fotorrealista' && !sceneImageUrls[scene.id]
    );
    if (!targets.length) {
      setImageBatchStatus('No hay escenas pendientes de imagen.');
      return;
    }
    setImageBatchRunning(true);
    setImageBatchStatus('Preparando generación secuencial…');
    let completed = 0;
    try {
      for (let index = 0; index < targets.length; index += 1) {
        const scene = targets[index];
        setImageBatchStatus('Generando escena ' + (index + 1) + ' de ' + targets.length + '…');
        try {
          const blob = await generateSceneImage({ prompt: scene.prompt, format: selected.format, sceneId: scene.id });
          const file = new File([blob], 'escena-' + String((selected.scenes ?? []).findIndex((item) => item.id === scene.id) + 1).padStart(2, '0') + '.png', { type: blob.type || 'image/png' });
          if (await importSceneImage(scene.id, file)) completed += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Error desconocido';
          setSceneImageErrors((items) => ({ ...items, [scene.id]: message }));
          setImageBatchStatus('Se detuvo en la escena ' + (index + 1) + '. ' + message + ' Las imágenes anteriores ya quedaron guardadas.');
          return;
        }
      }
      setImageBatchStatus(completed + ' imágenes generadas y guardadas en sus escenas correspondientes.');
    } finally {
      setImageBatchRunning(false);
    }
  }

  async function importSceneImage(sceneId: string, file: File | null): Promise<boolean> {
    if (!file) return false;
    if (!file.type.startsWith('image/')) {
      setSceneImageErrors((items) => ({ ...items, [sceneId]: 'Selecciona un archivo de imagen.' }));
      return false;
    }
    if (file.size > 20 * 1024 * 1024) {
      setSceneImageErrors((items) => ({ ...items, [sceneId]: 'La imagen supera el límite de 20 MB.' }));
      return false;
    }
    try {
      await saveSceneImage(sceneId, file);
      setSceneImageUrls((items) => {
        if (items[sceneId]) URL.revokeObjectURL(items[sceneId]);
        return { ...items, [sceneId]: URL.createObjectURL(file) };
      });
      setSceneImageErrors((items) => { const next = { ...items }; delete next[sceneId]; return next; });
      return true;
    } catch {
      setSceneImageErrors((items) => ({ ...items, [sceneId]: 'No se pudo guardar la imagen en este dispositivo. Comprueba el espacio disponible.' }));
      return false;
    }
  }

  async function clearSceneImage(sceneId: string) {
    try { await deleteSceneImage(sceneId); } catch { /* The preview can still be cleared locally. */ }
    setSceneImageUrls((items) => {
      if (items[sceneId]) URL.revokeObjectURL(items[sceneId]);
      const next = { ...items }; delete next[sceneId]; return next;
    });
    setSceneImageErrors((items) => { const next = { ...items }; delete next[sceneId]; return next; });
  }

  function updateScenes(nextScenes: Scene[]) {
    if (!selected) return;
    const updated: Project = { ...selected, scenes: nextScenes, updatedAt: new Date().toISOString() };
    setSelected(updated);
    setProjects((items) => items.map((item) => item.id === selected.id ? updated : item));
  }

  function generateScenes() {
    if (!selected) return;
    const parts = [
      { label: 'Gancho', text: selected.script?.hook ?? '' },
      { label: 'Desarrollo', text: selected.script?.development ?? '' },
      { label: 'Cierre', text: selected.script?.closing ?? '' },
    ];
    const chunks: { section: string; text: string }[] = [];
    for (const part of parts) {
      const sentences = part.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
      let buffer = '';
      for (const sentence of sentences.map((value) => value.trim()).filter(Boolean)) {
        buffer = buffer ? buffer + ' ' + sentence : sentence;
        if (buffer.split(/\s+/).length >= 22) {
          chunks.push({ section: part.label, text: buffer });
          buffer = '';
        }
      }
      if (buffer) chunks.push({ section: part.label, text: buffer });
    }
    const scenes: Scene[] = chunks.map((chunk) => {
      const words = chunk.text.split(/\s+/).length;
      const duration = Math.max(3, Math.min(8, Math.round(words / 2.35)));
      const imageType = 'Reconstrucción IA fotorrealista' as const;
      const visualDescription = chunk.section + ': Recrear el momento histórico con apariencia de fotografía documental realista; respetar época, arquitectura, vestuario y materiales.';
      const prompt = 'Fotografía hiperrealista cinematográfica de una escena histórica que represente: ' + chunk.text + ' Contexto histórico riguroso, iluminación natural, texturas y materiales auténticos, composición documental, formato ' + selected.format + '. Sin ilustración, sin caricatura, sin estética de videojuego.';
      return { id: crypto.randomUUID(), narration: chunk.text, visualDescription, imageType, prompt, duration };
    });
    updateScenes(scenes);
  }

  function updateScene(id: string, field: keyof Omit<Scene, 'id'>, value: string | number) {
    if (!selected) return;
    updateScenes((selected.scenes ?? []).map((scene) => scene.id === id ? { ...scene, [field]: value } : scene));
  }

  function removeScene(id: string) {
    if (!selected) return;
    void deleteSceneImage(id);
    void clearSceneImage(id);
    updateScenes((selected.scenes ?? []).filter((scene) => scene.id !== id));
  }

  function addScene() {
    if (!selected) return;
    const scene: Scene = {
      id: crypto.randomUUID(), narration: '', visualDescription: 'Describe el plano documental que acompañará esta narración.',
      imageType: 'Reconstrucción IA fotorrealista', duration: 5,
      prompt: 'Fotografía hiperrealista cinematográfica, reconstrucción histórica rigurosa, iluminación natural, materiales y vestuario auténticos, formato ' + selected.format + '.'
    };
    updateScenes([...(selected.scenes ?? []), scene]);
  }

  async function prepareWithoutGemini() {
    if (!selected) return;
    const previousWorks = projects.filter((project) => project.id !== selected.id)
      .map((project) => `- ${project.name}: ${project.editorialAngle || project.description || 'Sin resumen'}`).join('\\n');
    const prompt = `Actúa como investigador y guionista de documentales históricos para RikyTech AI Studio.
Tema: ${selected.name}. Descripción: ${selected.description || 'Sin descripción'}.
Duración: ${selected.duration} segundos. Formato: ${selected.format}.
Escribe en español, con tono documental cinematográfico, un gancho original, desarrollo y cierre, aproximadamente ${Math.round(selected.duration * 2.35)} palabras en total.
Verifica los hechos con fuentes reales y enlaces; distingue hechos, hipótesis y leyendas. No inventes fechas, citas ni URLs. Si no puedes consultar fuentes, indícalo y señala qué debe verificarse.
Evita repetir enfoques de trabajos anteriores:
${previousWorks || 'No hay trabajos anteriores registrados'}.
Entrega el resultado con tres apartados claramente identificados: GANCHO, DESARROLLO y CIERRE; después FUENTES y DATOS POR VERIFICAR. No incluyas indicaciones de cámara en la narración.
Cuando pegue la narración en el editor de RikyTech, podré generar escenas sin usar Gemini.`;
    try {
      await navigator.clipboard.writeText(prompt);
      setManualPromptCopied(true);
      setAiError('');
    } catch {
      setManualPromptCopied(false);
      setAiError('No se pudo copiar automáticamente. Comprueba los permisos del portapapeles del navegador.');
    }
  }

  async function generateWithAI() {
    if (!selected || aiLoading) return;
    setAiLoading(true);
    setAiError('');
    try {
      const previousWorks = projects.filter((project) => project.id !== selected.id).map((project) => ({
        title: project.name,
        angle: project.editorialAngle ?? '',
        summary: project.description || [project.script?.hook, project.script?.development, project.script?.closing].filter(Boolean).join(' ').slice(0, 500)
      }));
      const result = await generateDocumentary({
        topic: selected.name + (selected.description ? ': ' + selected.description : ''),
        duration: selected.duration ?? 80,
        format: selected.format,
        previousWorks
      });
      const generatedScenes = Array.isArray(result.scenes) && result.scenes.length > 0
        ? result.scenes
        : buildScenesFromScript({ hook: result.hook, development: result.development, closing: result.closing }, selected.format);
      const scenes: Scene[] = generatedScenes.map((scene) => ({
        id: crypto.randomUUID(),
        narration: scene.narration,
        visualDescription: scene.visualDescription,
        imageType: scene.imageType === 'Archivo o fotografía auténtica' ? 'Archivo o fotografía auténtica' : 'Reconstrucción IA fotorrealista',
        prompt: scene.prompt,
        duration: Math.max(1, Number(scene.duration) || 5)
      }));
      const updated: Project = {
        ...selected,
        script: { hook: result.hook, development: result.development, closing: result.closing },
        scenes,
        editorialAngle: result.editorialAngle,
        editorialNote: result.editorialNote,
        sources: result.sources ?? [],
        status: 'En desarrollo',
        updatedAt: new Date().toISOString()
      };
      setSelected(updated);
      setProjects((items) => items.map((item) => item.id === selected.id ? updated : item));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'No se pudo generar el documental.');
    } finally {
      setAiLoading(false);
    }
  }

  function updateDuration(value: string) {
    if (!selected) return;
    const next = Number(value) as 60 | 80 | 100;
    const updated = { ...selected, duration: next, updatedAt: new Date().toISOString() };
    setSelected(updated);
    setProjects((items) => items.map((item) => item.id === selected.id ? updated : item));
  }

  const scriptText = selected ? [selected.script?.hook, selected.script?.development, selected.script?.closing].filter(Boolean).join(' ') : '';
  const scriptWords = scriptText.trim() ? scriptText.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.round(scriptWords / 2.35);
  function deleteProject(project: Project) {
    if (!window.confirm(`¿Eliminar el proyecto "${project.name}" de este dispositivo?`)) return;
    setProjects((items) => items.filter((item) => item.id !== project.id));
    if (selected?.id === project.id) setSelected(null);
  }

  return (
    <div className="app-shell">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <div className="brand"><span className="brand-mark"><Clapperboard size={21} /></span><span>RikyTech <b>AI Studio</b></span><button className="close-menu" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X /></button></div>
        <div className="workspace-label">ESPACIO DE TRABAJO</div>
        <button className="nav-item active" onClick={() => { setSelected(null); setMenuOpen(false); }}><Clapperboard size={18}/> Estudio</button>
        <button className="nav-item" onClick={() => { setSelected(null); setMenuOpen(false); }}><FileText size={18}/> Guiones</button>
        <button className="nav-item" onClick={() => setMenuOpen(false)}><Images size={18}/> Biblioteca</button>
        <button className="nav-item" onClick={() => setMenuOpen(false)}><Settings size={18}/> Ajustes</button>
        <div className="sidebar-bottom"><span className="online-dot"/> Guardado local activado<br/><small>Versión 0.7.0 · En desarrollo</small></div>
      </aside>
      {menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"/>}
      <main className="main-area">
        <header className="topbar"><button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu/></button><span className="crumb">Espacio de trabajo <b>/ {selected ? selected.name : 'Estudio'}</b></span><span className="device-pill"><Smartphone size={15}/> Web + Android</span></header>
        {selected ? (
          <section className="detail-view">
            <button className="back-button" onClick={() => setSelected(null)}><ArrowLeft size={16}/> Todos los proyectos</button>
            <div className="detail-heading"><div><div className="eyebrow">PROYECTO DOCUMENTAL</div><h1>{selected.name}</h1><p>{selected.description || 'Añade una descripción para definir la historia que quieres contar.'}</p></div><button className="secondary-button" onClick={() => openEdit(selected)}><Pencil size={15}/> Editar</button></div>
            <div className="detail-stats"><div><span>FORMATO</span><b>{selected.format} · {selected.format === '9:16' ? 'Vertical' : 'Horizontal'}</b></div><div><span>ESTADO</span><b>{selected.status}</b></div><div><span>ÚLTIMA EDICIÓN</span><b>{dateLabel(selected.updatedAt)}</b></div></div>
            <section className="visual-direction"><div className="visual-direction-head"><div><div className="eyebrow">IDENTIDAD VISUAL DEL ESTUDIO</div><h2>Fotografía hiperrealista cinematográfica</h2><p>El estándar visual de este documental: imágenes con apariencia de fotografía profesional, iluminación natural y detalles realistas.</p></div><span className="visual-default">ESTILO PREDETERMINADO</span></div><div className="visual-rules"><article><b>Fotografía auténtica</b><p>Usar archivos, fotografías y documentos reales cuando existan y sean pertinentes.</p><span className="visual-tag authentic">Material histórico real</span></article><article><b>Reconstrucción histórica fotorrealista</b><p>Recrear con IA épocas, personajes y acontecimientos que no cuentan con imágenes auténticas.</p><span className="visual-tag generated">Recreación generada con IA</span></article></div><div className="visual-note">Regla documental: una recreación generada nunca se presentará como una fotografía histórica auténtica. Las escenas deberán identificar claramente su naturaleza.</div></section>
            <div className="section-heading"><div><div className="eyebrow">PRODUCCIÓN</div><h2>Construye tu documental</h2></div><span className="phase-tag">FASE 1</span></div>
            <div className="stage-grid">{stages.map((stage, index) => <article className="stage-card" key={stage.title}><div className="stage-top"><span className="stage-icon"><stage.icon size={20}/></span><span className="stage-number">0{index + 1}</span></div><h3>{stage.title}</h3><p>{stage.detail}</p><span className="stage-status">{stage.status}</span></article>)}</div>

            <section className="ai-generator-panel">
              <div className="ai-generator-copy">
                <div className="eyebrow">INVESTIGACIÓN Y REDACCIÓN CON IA</div>
                <h2>Crear documental con IA o sin créditos</h2>
                <p>Gemini genera el documental automáticamente cuando tiene cuota. Si se agota, copia un encargo de investigación para usarlo en ChatGPT u otro asistente, pega el guion en el editor y genera las escenas aquí sin gastar créditos de Gemini.</p>
              </div>
              <button type="button" className="primary-button" onClick={generateWithAI} disabled={aiLoading}>
                <WandSparkles size={17}/> {aiLoading ? 'Gemini está investigando y escribiendo…' : 'Generar documental con Gemini'}
              </button>
              <button type="button" className="secondary-button" onClick={() => void prepareWithoutGemini()}>
                <FileText size={16}/> Preparar documental sin Gemini (copiar encargo)
              </button>
              {manualPromptCopied && <p className="ai-generator-status" role="status">Encargo copiado. Pégalo en ChatGPT u otro asistente, revisa las fuentes y copia el gancho, desarrollo y cierre al editor de abajo. Después pulsa «Generar escenas desde el guion». Esta opción no consume cuota de Gemini.</p>}
              {aiLoading && <p className="ai-generator-status">Esto puede tardar unos segundos. No cierres esta pantalla.</p>}
              {aiError && <p className="ai-generator-error" role="alert">{aiError}</p>}
              {selected.editorialAngle && <div className="ai-editorial-result"><b>Enfoque editorial:</b> {selected.editorialAngle}{selected.editorialNote && <p>{selected.editorialNote}</p>}</div>}
              {!!selected.sources?.length && <div className="ai-sources"><b>Fuentes para verificar</b><ul>{selected.sources.map((source, index) => <li key={index}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> — {source.relevance}</li>)}</ul></div>}
            </section>
            <section className="scene-planner">
              <div className="scene-planner-heading">
                <div><div className="eyebrow">PLANIFICACIÓN VISUAL</div><h2>Generador de escenas</h2><p>Divide la narración en fragmentos y prepara la descripción visual y el prompt de cada toma.</p></div>
                <button type="button" className="primary-button" onClick={generateScenes}><WandSparkles size={16}/> {selected.scenes?.length ? 'Regenerar escenas (opcional)' : 'Generar escenas desde el guion'}</button>
              </div>
              <div className="scene-policy">Estilo: fotografía hiperrealista cinematográfica · Formato {selected.format}. Las reconstrucciones generadas se identifican por separado del material histórico auténtico.</div>
              {!!selected.scenes?.some((scene) => scene.imageType === 'Reconstrucción IA fotorrealista') && <div className="flow-batch-panel">
                <div><div className="eyebrow">GENERACIÓN SECUENCIAL</div><b>Generar y colocar imágenes automáticamente</b><p>RikyTech toma el prompt de cada escena, solicita una imagen y la guarda en la tarjeta correcta antes de continuar con la siguiente.</p></div>
                <button type="button" className="primary-button" disabled={imageBatchRunning || !(import.meta.env.VITE_IMAGE_GENERATION_URL as string | undefined)} onClick={() => void generateAllSceneImages()}><WandSparkles size={16}/>{imageBatchRunning ? 'Generando imágenes…' : 'Generar todas las escenas'}</button>
                {!(import.meta.env.VITE_IMAGE_GENERATION_URL as string | undefined) && <p className="flow-batch-hint">El flujo automático ya está preparado, pero falta conectar un proveedor de imágenes compatible. No se ha configurado ninguno para evitar cargos o consumo de créditos sin tu autorización.</p>}
                {imageBatchStatus && <p className="ai-generator-status" role="status">{imageBatchStatus}</p>}
                <button type="button" className="primary-button" onClick={() => void prepareFlowBatch()}><ExternalLink size={16}/> Preparar lote y abrir Flow</button>
                <label className="flow-batch-import"><Upload size={16}/> Importar varias imágenes de Flow
                  <input type="file" accept="image/*" multiple onChange={(e) => { void importFlowBatchImages(e.currentTarget.files); e.currentTarget.value = ''; }}/>
                </label>
                <p className="flow-batch-hint">Selecciona juntas las imágenes descargadas. Se ordenan por nombre (01, 02, 03…) y se asignan a las escenas IA en ese orden. Máximo 20 MB por imagen.</p>
                {flowBatchStatus && <p className="ai-generator-status" role="status">{flowBatchStatus}</p>}
                {flowImportStatus && <p className="ai-generator-status" role="status">{flowImportStatus}</p>}
              </div>}
              {!(selected.scenes?.length) ? <div className="scene-empty"><Images size={25}/><b>Todavía no hay escenas</b><span>Escribe primero el guion y pulsa «Generar escenas». También puedes añadir una escena manualmente.</span><button className="secondary-button" onClick={addScene}>Añadir escena vacía</button></div> : <>
                <div className="scene-summary"><b>{selected.scenes.length} escenas</b><span>{selected.scenes.reduce((sum, scene) => sum + scene.duration, 0)} segundos estimados</span></div>
                <div className="scene-list">{selected.scenes.map((scene, index) => <article className="scene-card" key={scene.id}>
                  <div className="scene-card-top"><div><span className="scene-index">ESCENA {String(index + 1).padStart(2, '0')}</span><span className="scene-kind">{scene.imageType}</span></div><button className="scene-remove" onClick={() => removeScene(scene.id)} aria-label={'Eliminar escena ' + (index + 1)}><Trash2 size={16}/></button></div>
                  <label className="scene-field">Narración<textarea rows={3} value={scene.narration} onChange={(e) => updateScene(scene.id, 'narration', e.target.value)} placeholder="Fragmento del guion asociado a esta escena"/></label>
                  <label className="scene-field">Tipo de imagen<select value={scene.imageType} onChange={(e) => updateScene(scene.id, 'imageType', e.target.value)}><option>Reconstrucción IA fotorrealista</option><option>Archivo o fotografía auténtica</option></select></label>
                  <label className="scene-field">Descripción visual<textarea rows={3} value={scene.visualDescription} onChange={(e) => updateScene(scene.id, 'visualDescription', e.target.value)}/></label>
                  <label className="scene-field">Prompt visual<textarea rows={4} value={scene.prompt} onChange={(e) => updateScene(scene.id, 'prompt', e.target.value)}/></label>
                  <label className="scene-duration">Duración estimada (segundos)<input type="number" min="1" max="30" value={scene.duration} onChange={(e) => updateScene(scene.id, 'duration', Math.max(1, Number(e.target.value) || 1))}/></label>
                  {scene.imageType === 'Reconstrucción IA fotorrealista' && <button type="button" className="generate-scene-image" onClick={() => openFlowForScene(scene)}><ExternalLink size={15}/> Abrir Flow y copiar prompt</button>}
                  <div className="scene-image-import">
                    <div className="scene-image-import-heading"><ImageIcon size={16}/><b>Imagen de esta escena</b></div>
                    <label className="scene-image-upload" htmlFor={'scene-image-' + scene.id}><Upload size={15}/> {sceneImageUrls[scene.id] ? 'Cambiar imagen' : 'Importar imagen desde el teléfono'}</label>
                    <input id={'scene-image-' + scene.id} className="scene-image-input" type="file" accept="image/*" onChange={(e) => { void importSceneImage(scene.id, e.target.files?.[0] ?? null); e.currentTarget.value = ''; }}/>
                    {sceneImageUrls[scene.id] && <div className="scene-generated-preview"><img src={sceneImageUrls[scene.id]} alt={'Imagen importada para la escena ' + (index + 1)}/><span>Imagen guardada en este dispositivo</span><button type="button" className="remove-scene-image" onClick={() => void clearSceneImage(scene.id)}><XCircle size={14}/> Quitar imagen</button></div>}
                    {sceneImageErrors[scene.id] && <p className="scene-generation-error">{sceneImageErrors[scene.id]}</p>}
                  </div>
                  <div className="scene-card-footer"><span>{scene.imageType === 'Archivo o fotografía auténtica' ? 'Verificar procedencia y fecha de la fuente' : 'Recreación generada · No es fotografía de archivo'}</span><button className="copy-prompt" onClick={() => void navigator.clipboard?.writeText(scene.prompt)}>Copiar prompt</button></div>
                </article>)}</div>
              </>}
              <button className="secondary-button add-scene-button" onClick={addScene}><Plus size={15}/> Añadir escena manualmente</button>
            </section>
            <section className="script-editor">
              <div className="script-editor-heading"><div><div className="eyebrow">TALLER DE NARRACIÓN</div><h2>Editor de guion</h2><p>Escribe la narración por partes. Los cambios se guardan automáticamente.</p></div><label className="duration-control" htmlFor="script-duration">Duración objetivo<select id="script-duration" value={selected.duration ?? 80} onChange={(e) => updateDuration(e.target.value)}><option value="60">60 segundos</option><option value="80">80 segundos</option><option value="100">100 segundos</option></select></label></div>
              <div className="script-metrics"><div><b>{scriptWords}</b><span>PALABRAS</span></div><div><b>~{estimatedSeconds}s</b><span>DURACIÓN ESTIMADA</span></div><div><b>{selected.duration ?? 80}s</b><span>OBJETIVO</span></div></div>
              <label className="script-field" htmlFor="script-hook"><span><b>01 · Gancho inicial</b><small>Una pregunta o dato impactante que atrape desde el primer segundo.</small></span><textarea id="script-hook" rows={3} maxLength={1500} placeholder="¿Y si uno de los mayores misterios del antiguo Egipto hubiera sido borrado de la historia?" value={selected.script?.hook ?? ''} onChange={(e) => updateScript('hook', e.target.value)}/></label>
              <label className="script-field" htmlFor="script-development"><span><b>02 · Desarrollo</b><small>Contexto, hechos comprobados y detalles esenciales. Sin desviarse del tema.</small></span><textarea id="script-development" rows={7} maxLength={7000} placeholder="Explica qué ocurrió, cuándo, dónde y por qué es importante..." value={selected.script?.development ?? ''} onChange={(e) => updateScript('development', e.target.value)}/></label>
              <label className="script-field" htmlFor="script-closing"><span><b>03 · Cierre</b><small>Termina con un hecho memorable o una reflexión que deje huella.</small></span><textarea id="script-closing" rows={3} maxLength={1500} placeholder="Y aunque han pasado miles de años, la pregunta sigue abierta..." value={selected.script?.closing ?? ''} onChange={(e) => updateScript('closing', e.target.value)}/></label>
              <div className="script-footer"><span><Save size={15}/> Guardado automático en este dispositivo</span><button type="button" className="secondary-button" onClick={() => { const text = [selected.script?.hook, selected.script?.development, selected.script?.closing].filter(Boolean).join('\n\n'); void navigator.clipboard?.writeText(text); }}>Copiar guion</button></div>
              {estimatedSeconds > (selected.duration ?? 80) && <p className="duration-warning">El texto supera la duración objetivo. Puedes resumirlo para mantener el ritmo del documental.</p>}
            </section>
          </section>
        ) : (
          <>
            <section className="welcome"><div className="eyebrow">TU ESTUDIO CREATIVO</div><h1>De una idea a una<br/><span>historia que impacta.</span></h1><p>Planifica, produce y organiza documentales cortos desde un solo lugar.</p><button className="primary-button" onClick={openCreate}><Plus size={18}/> Crear proyecto</button></section>
            <section className="section-heading"><div><div className="eyebrow">FLUJO DE PRODUCCIÓN</div><h2>Tu espacio de creación</h2></div><span className="phase-tag">FASE 1 · PROYECTOS</span></section>
            <div className="stage-grid">{stages.map((stage, index) => <article className="stage-card" key={stage.title}><div className="stage-top"><span className="stage-icon"><stage.icon size={20}/></span><span className="stage-number">0{index + 1}</span></div><h3>{stage.title}</h3><p>{stage.detail}</p><span className="stage-status">{stage.status}</span></article>)}</div>
            <section className="projects-section"><div className="projects-heading"><div><div className="eyebrow">TU BIBLIOTECA DE TRABAJO</div><h2>Mis proyectos <span className="count-pill">{projects.length}</span></h2></div><button className="secondary-button" onClick={openCreate}><Plus size={16}/> Nuevo proyecto</button></div>
              {projects.length > 0 && <div className="search-box"><Search size={17}/><input aria-label="Buscar proyectos" placeholder="Buscar por nombre..." value={search} onChange={(e) => setSearch(e.target.value)}/></div>}
              {filteredProjects.length ? <div className="project-grid">{filteredProjects.map((project) => <article className="project-card" key={project.id}><button className="project-open" onClick={() => setSelected(project)}><span className="project-icon"><FolderOpen size={21}/></span><span className="project-format">{project.format}</span><b>{project.name}</b><small>{project.description || 'Sin descripción todavía'}</small><span className="project-meta">{project.status} · Editado {dateLabel(project.updatedAt)}</span></button><div className="project-actions"><button onClick={() => openEdit(project)} aria-label={`Editar ${project.name}`}><Pencil size={15}/></button><button onClick={() => deleteProject(project)} aria-label={`Eliminar ${project.name}`}><Trash2 size={15}/></button></div></article>)}</div> : <div className="empty-project"><div className="empty-icon"><Play size={22}/></div><b>{projects.length ? 'No encontramos ese proyecto' : 'Aún no hay proyectos'}</b><span>{projects.length ? 'Prueba con otro nombre.' : 'Crea tu primer documental. Se guardará en este dispositivo.'}</span>{!projects.length && <button className="secondary-button" onClick={openCreate}><Plus size={16}/> Crear mi primer proyecto</button>}</div>}
            </section>
          </>
        )}
      </main>
      {showCreate && <div className="modal-backdrop" role="presentation"><form className="modal project-form" onSubmit={saveProject}><button type="button" className="modal-close" onClick={() => setShowCreate(false)} aria-label="Cerrar"><X/></button><div className="eyebrow">{editing ? 'EDITAR PROYECTO' : 'NUEVO PROYECTO'}</div><h2>{editing ? 'Actualiza tu proyecto' : '¿Qué historia vamos a contar?'}</h2><label htmlFor="project-name">Nombre del proyecto</label><input id="project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. El misterio de Akenatón" maxLength={80} required autoFocus/><label htmlFor="project-description">Descripción (opcional)</label><textarea id="project-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Resume la historia que quieres producir..." rows={3} maxLength={500}/><label htmlFor="project-format">Formato de video</label><select id="project-format" value={format} onChange={(e) => setFormat(e.target.value as '9:16' | '16:9')}><option value="9:16">Vertical · 9:16 (Shorts)</option><option value="16:9">Horizontal · 16:9</option></select><label htmlFor="project-duration">Duración objetivo del documental</label><select id="project-duration" value={duration} onChange={(e) => setDuration(Number(e.target.value) as 60 | 80 | 100)}><option value={60}>60 segundos</option><option value={80}>80 segundos</option><option value={100}>100 segundos</option></select><label htmlFor="project-status">Estado</label><select id="project-status" value={status} onChange={(e) => setStatus(e.target.value as Project['status'])}><option>Idea</option><option>En desarrollo</option><option>Terminado</option></select><p className="modal-note">El proyecto y su guion se guardan en este navegador. La sincronización entre dispositivos llegará con la cuenta en la nube.</p><button className="primary-button" type="submit"><Save size={16}/> {editing ? 'Guardar cambios' : 'Crear proyecto'}</button></form></div>}
    </div>
  );
}
