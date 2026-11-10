import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Film, Music2, Square, Volume2 } from 'lucide-react';
import { ALL_FORMATS, AudioBufferSource, BlobSource, BufferTarget, CanvasSource, Input, Output, Quality, WebMOutputFormat } from 'mediabunny';

type EditorScene = { id: string; narration: string; duration: number };
type Props = { scenes: EditorScene[]; imageUrls: Record<string, string>; format: '9:16' | '16:9' };

export default function VideoEditor({ scenes, imageUrls, format }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const [voiceUrl, setVoiceUrl] = useState('');
  const [musicUrl, setMusicUrl] = useState('');
  const [voiceName, setVoiceName] = useState('');
  const [musicName, setMusicName] = useState('');
  const [musicVolume, setMusicVolume] = useState(0.18);
  const [voiceVolume, setVoiceVolume] = useState(1);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState('');
  const [previewIndex, setPreviewIndex] = useState(0);
  const stopRef = useRef(false);

  const totalSeconds = scenes.reduce((sum, scene) => sum + Math.max(1, Number(scene.duration) || 1), 0);
  const width = format === '9:16' ? 720 : 1280;
  const height = format === '9:16' ? 1280 : 720;

  useEffect(() => {
    const next = new Map<string, HTMLImageElement>();
    Object.entries(imageUrls).forEach(([id, url]) => {
      if (!url) return;
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      next.set(id, img);
    });
    imageCache.current = next;
    return () => { imageCache.current.clear(); };
  }, [imageUrls]);

  useEffect(() => () => {
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    if (musicUrl) URL.revokeObjectURL(musicUrl);
  }, [voiceUrl, musicUrl]);

  const sceneStarts = useMemo(() => {
    let elapsed = 0;
    return scenes.map((scene) => {
      const start = elapsed;
      elapsed += Math.max(1, Number(scene.duration) || 1);
      return start;
    });
  }, [scenes]);

  function setAudioFile(file: File | undefined, kind: 'voice' | 'music') {
    if (!file) return;
    if (!file.type.startsWith('audio/')) { setProgress('Selecciona un archivo de audio válido.'); return; }
    const url = URL.createObjectURL(file);
    if (kind === 'voice') {
      setVoiceUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
      setVoiceName(file.name);
    } else {
      setMusicUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
      setMusicName(file.name);
    }
    setProgress('');
  }

  function drawImage(ctx: CanvasRenderingContext2D, index: number, elapsedMs: number, alpha = 1, durationMs?: number) {
    const scene = scenes[index];
    const img = scene ? imageCache.current.get(scene.id) : undefined;
    if (!img || !img.complete || !img.naturalWidth) return;
    const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
    // A continuous Ken Burns move: a visible push-in plus a slow diagonal camera drift.
    // The old formula reached its zoom limit in under a second, then held perfectly still.
    const sceneDuration = durationMs ?? Math.max(1, Number(scene?.duration) || 1) * 1000;
    const progress = Math.max(0, Math.min(1, elapsedMs / sceneDuration));
    const eased = progress * progress * (3 - 2 * progress);
    const zoom = 1.035 + 0.135 * eased;
    const dw = img.naturalWidth * scale * zoom;
    const dh = img.naturalHeight * scale * zoom;
    const direction = index % 4;
    const phase = progress * Math.PI / 2;
    const driftX = Math.sin(phase) * width * 0.035 * (direction % 2 === 0 ? 1 : -1);
    const driftY = (1 - Math.cos(phase)) * height * 0.028 * (direction < 2 ? 1 : -1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, (width - dw) / 2 + driftX, (height - dh) / 2 + driftY, dw, dh);
    ctx.restore();
  }

  function drawCaption(ctx: CanvasRenderingContext2D, index: number, sceneElapsed: number) {
    const scene = scenes[index];
    const caption = scene?.narration?.trim() || 'Añade la narración de esta escena';
    const words = caption.split(/\s+/).filter(Boolean);
    const duration = Math.max(1, Number(scene?.duration) || 1);
    const visibleCount = Math.max(1, Math.min(words.length, Math.ceil(words.length * Math.min(1, sceneElapsed / duration))));
    const activeCaption = words.slice(0, visibleCount).join(' ');
    const maxWidth = width * 0.84;
    const fontSize = Math.round(width * 0.043);
    ctx.font = '600 ' + fontSize + 'px Arial';
    const lines: string[] = [];
    let line = '';
    for (const word of activeCaption.split(/\s+/)) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
    const visible = lines.slice(-3);
    const lineHeight = fontSize * 1.25;
    const boxHeight = visible.length * lineHeight + fontSize * 0.85;
    const y = height - height * 0.085;
    ctx.fillStyle = 'rgba(0,0,0,.76)';
    ctx.fillRect(width * 0.055, y - boxHeight, width * 0.89, boxHeight);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    visible.forEach((text, i) => ctx.fillText(text, width / 2, y - boxHeight + fontSize * 0.78 + i * lineHeight, maxWidth));
    ctx.font = '600 ' + Math.round(width * 0.018) + 'px Arial';
    ctx.fillStyle = '#e1d9ff';
    ctx.fillText('RIKYTECH AI STUDIO', width / 2, height * 0.055);
  }

  function drawFrame(index: number, elapsed: number, sceneElapsed: number, transitionAlpha = 1, previousIndex = -1) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#10131b';
    ctx.fillRect(0, 0, width, height);
    if (previousIndex >= 0 && transitionAlpha < 1) {
      const previousDuration = Math.max(1, Number(scenes[previousIndex]?.duration) || 1) * 1000;
      drawImage(ctx, previousIndex, previousDuration, 1 - transitionAlpha, previousDuration);
    }
    const sceneDuration = Math.max(1, Number(scenes[index]?.duration) || 1) * 1000;
    drawImage(ctx, index, sceneElapsed * 1000, transitionAlpha, sceneDuration);
    if (!imageCache.current.get(scenes[index]?.id || '')?.complete) {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#25213e'); gradient.addColorStop(1, '#10131b');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    }
    drawCaption(ctx, index, sceneElapsed);
  }

  function previewScene(index: number) {
    setPreviewIndex(index);
    drawFrame(index, 0, 0);
  }

  async function exportVideo() {
    const canvas = canvasRef.current;
    if (!canvas || !scenes.length || recording) return;
    if (!('VideoEncoder' in window) || !('AudioEncoder' in window)) {
      setProgress('Este navegador no ofrece codificación multimedia moderna. Actualiza Chrome para exportar desde el teléfono.');
      return;
    }

    setRecording(true);
    stopRef.current = false;
    setProgress('Preparando el motor de montaje…');
    let output: Output | null = null;
    try {
      // Decode and mix the selected audio offline so it is synchronized by timestamps,
      // rather than depending on real-time playback while the phone records the canvas.
      let mixedAudio: AudioBuffer | null = null;
      if (voiceUrl || musicUrl) {
        const sampleRate = 48000;
        const offline = new OfflineAudioContext(2, Math.ceil(totalSeconds * sampleRate), sampleRate);
        const loadAudio = async (url: string) => {
          const response = await fetch(url);
          if (!response.ok) throw new Error('No se pudo leer un archivo de audio.');
          return offline.decodeAudioData(await response.arrayBuffer());
        };
        if (voiceUrl) {
          const buffer = await loadAudio(voiceUrl);
          const source = offline.createBufferSource();
          const gain = offline.createGain();
          source.buffer = buffer;
          gain.gain.value = voiceVolume;
          source.connect(gain).connect(offline.destination);
          source.start(0);
        }
        if (musicUrl) {
          const buffer = await loadAudio(musicUrl);
          const source = offline.createBufferSource();
          const gain = offline.createGain();
          source.buffer = buffer;
          source.loop = true;
          gain.gain.value = musicVolume;
          source.connect(gain).connect(offline.destination);
          source.start(0);
        }
        setProgress('Mezclando narración y música…');
        mixedAudio = await offline.startRendering();
      }

      const target = new BufferTarget();
      output = new Output({ format: new WebMOutputFormat(), target });
      const videoSource = new CanvasSource(canvas, {
        codec: 'vp8',
        quality: new Quality({ bitrate: 3_500_000 }),
        latencyMode: 'quality',
        keyFrameInterval: 2,
      });
      output.addVideoTrack(videoSource, { frameRate: 24 });
      let audioSource: AudioBufferSource | null = null;
      if (mixedAudio) {
        audioSource = new AudioBufferSource({ codec: 'opus', quality: new Quality({ bitrate: 128_000 }) });
        output.addAudioTrack(audioSource);
      }

      await output.start();
      const fps = 24;
      const frameCount = Math.ceil(totalSeconds * fps);
      const renderVideo = async () => {
        for (let frame = 0; frame < frameCount; frame++) {
          if (stopRef.current) throw new Error('Exportación detenida por el usuario.');
          const timestamp = frame / fps;
          let index = scenes.length - 1;
          for (let i = 0; i < scenes.length; i++) {
            const end = sceneStarts[i] + Math.max(1, Number(scenes[i].duration) || 1);
            if (timestamp < end) { index = i; break; }
          }
          const sceneElapsed = Math.max(0, timestamp - sceneStarts[index]);
          const transitionDuration = 0.65;
          const isTransition = index > 0 && sceneElapsed < transitionDuration;
          const alpha = isTransition ? Math.min(1, sceneElapsed / transitionDuration) : 1;
          drawFrame(index, timestamp * 1000, sceneElapsed, alpha, isTransition ? index - 1 : -1);
          await videoSource.add(timestamp, 1 / fps, { keyFrame: frame % (fps * 2) === 0 });
          if (index !== previewIndex) setPreviewIndex(index);
          if (frame % 24 === 0 || frame === frameCount - 1) {
            setProgress('Renderizando fotogramas ' + (frame + 1) + ' de ' + frameCount + ' · ' + Math.round((frame + 1) / frameCount * 100) + '%');
          }
        }
        videoSource.close();
      };
      const tasks: Promise<void>[] = [renderVideo()];
      if (audioSource && mixedAudio) {
        tasks.push(audioSource.add(mixedAudio).then(() => audioSource?.close()));
      }
      await Promise.all(tasks);
      setProgress('Finalizando archivo de vídeo…');
      await output.finalize();

      const buffer = target.buffer;
      if (!buffer || buffer.byteLength < 10000) throw new Error('El archivo final está vacío o incompleto.');
      const blob = new Blob([buffer], { type: 'video/webm' });
      // Read the finished container and verify its real duration before download.
      const check = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const actualDuration = await check.computeDuration();
      if (!Number.isFinite(actualDuration) || Math.abs(actualDuration - totalSeconds) > 1.0) {
        throw new Error('El archivo generado dura ' + (Number.isFinite(actualDuration) ? actualDuration.toFixed(1) : 'un tiempo desconocido') + ' s; se esperaban ' + totalSeconds + ' s. No se descargó.');
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'rikytech-documental.webm';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setProgress('Vídeo completo verificado · ' + actualDuration.toFixed(1) + ' segundos · WEBM');
    } catch (error) {
      if (output) {
        try { await output.cancel(); } catch { /* Output may already be finalized. */ }
      }
      const message = error instanceof Error ? error.message : 'Error desconocido durante el montaje.';
      setProgress(message.includes('detenida') ? message : 'No se pudo completar el montaje: ' + message);
    } finally {
      setRecording(false);
      stopRef.current = false;
    }
  }

  function stopExport() {
    stopRef.current = true;
    setProgress('Deteniendo el montaje de forma segura…');
  }

  return <section className="video-editor">
    <div className="video-editor-heading"><div><div className="eyebrow">POSTPRODUCCIÓN</div><h2>Editor de montaje</h2><p>Transiciones suaves, subtítulos progresivos, movimiento de cámara y mezcla de audio en el dispositivo.</p></div><span className="visual-default">LOCAL · SIN API DE PAGO</span></div>
    <div className="editor-workspace">
      <div className="editor-preview">
        <canvas ref={canvasRef} width={width} height={height} aria-label="Vista previa del montaje" />
        <div className="editor-preview-controls">{scenes.map((scene, index) => <button key={scene.id} className={previewIndex === index ? 'active' : ''} onClick={() => previewScene(index)}>{index + 1}</button>)}</div>
      </div>
      <div className="editor-controls">
        <div className="editor-track"><b><Volume2 size={16}/> Narración</b><label className="editor-file-button">Cargar audio de voz<input type="file" accept="audio/*" onChange={(e) => { setAudioFile(e.target.files?.[0], 'voice'); e.currentTarget.value = ''; }}/></label><small>{voiceName || 'Sin archivo de narración'}</small><label>Volumen <input type="range" min="0" max="1.5" step=".05" value={voiceVolume} onChange={(e) => setVoiceVolume(Number(e.target.value))}/></label></div>
        <div className="editor-track"><b><Music2 size={16}/> Música</b><label className="editor-file-button">Cargar música<input type="file" accept="audio/*" onChange={(e) => { setAudioFile(e.target.files?.[0], 'music'); e.currentTarget.value = ''; }}/></label><small>{musicName || 'Sin música de fondo'}</small><label>Volumen <input type="range" min="0" max=".6" step=".02" value={musicVolume} onChange={(e) => setMusicVolume(Number(e.target.value))}/></label></div>
        <div className="editor-track"><b><Film size={16}/> Línea de tiempo</b><small>{scenes.length} escenas · {totalSeconds} segundos estimados · {format}</small><div className="editor-timeline">{scenes.map((scene, index) => <button key={scene.id} onClick={() => previewScene(index)} className={previewIndex === index ? 'active' : ''}><span>{String(index + 1).padStart(2, '0')}</span><small>{scene.duration}s</small></button>)}</div></div>
        <div className="editor-actions"><button className="primary-button" onClick={() => void exportVideo()} disabled={recording || !scenes.length}><Download size={16}/> Exportar vídeo</button>{recording && <button className="secondary-button" onClick={stopExport}><Square size={15}/> Detener</button>}</div>
        {progress && <p className="ai-generator-status" role="status">{progress}</p>}
        <p className="editor-footnote">El editor selecciona MP4 si el navegador lo admite; si no, exporta WEBM. Las transiciones y los subtítulos se generan durante el montaje. La narración completa empieza al inicio: ajusta los segundos de cada escena para alinear los subtítulos con la voz. La exportación depende de la memoria y compatibilidad del teléfono.</p>
      </div>
    </div>
  </section>;
}
