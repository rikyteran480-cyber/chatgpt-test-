import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Film, Music2, Play, Square, Volume2 } from 'lucide-react';

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
  const rafRef = useRef<number | null>(null);
  const stopRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);

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
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
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

  function drawImage(ctx: CanvasRenderingContext2D, index: number, elapsed: number, alpha = 1) {
    const scene = scenes[index];
    const img = scene ? imageCache.current.get(scene.id) : undefined;
    if (!img || !img.complete || !img.naturalWidth) return;
    const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
    const zoom = 1 + Math.min(0.075, Math.max(0, elapsed) * 0.00012);
    const dw = img.naturalWidth * scale * zoom;
    const dh = img.naturalHeight * scale * zoom;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
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
    if (previousIndex >= 0 && transitionAlpha < 1) drawImage(ctx, previousIndex, Math.max(0, elapsed - 650), 1 - transitionAlpha);
    drawImage(ctx, index, sceneElapsed * 1000, transitionAlpha);
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
    if (!canvas || !scenes.length) return;
    if (!('MediaRecorder' in window) || !canvas.captureStream) {
      setProgress('Este navegador no admite exportación de vídeo. Prueba con Chrome actualizado.');
      return;
    }
    if (recording) return;

    const mp4Types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];
    const webmTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mimeType = mp4Types.find((type) => MediaRecorder.isTypeSupported(type))
      || webmTypes.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { setProgress('Este navegador no ofrece un formato de grabación compatible.'); return; }

    setRecording(true);
    setProgress('Preparando montaje…');
    stopRef.current = false;
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    const audioElements: HTMLAudioElement[] = [];
    try {
      const addAudio = (url: string, volume: number, loop: boolean) => {
        if (!url) return;
        const audio = new Audio(url);
        audio.preload = 'auto';
        audio.loop = loop;
        audio.volume = 1;
        const source = audioContext.createMediaElementSource(audio);
        const gain = audioContext.createGain();
        gain.gain.value = volume;
        source.connect(gain);
        gain.connect(destination);
        gain.connect(audioContext.destination);
        audioElements.push(audio);
      };
      addAudio(voiceUrl, voiceVolume, false);
      addAudio(musicUrl, musicVolume, true);
      await audioContext.resume();

      const stream = canvas.captureStream(30);
      destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        setProgress('El navegador interrumpió la exportación. Prueba con un vídeo más corto.');
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        void audioContext.close();
      };
      recorder.onstop = () => {
        const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = 'rikytech-documental.' + extension; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
        stream.getTracks().forEach((track) => track.stop());
        audioElements.forEach((audio) => { audio.pause(); audio.src = ''; });
        void audioContext.close();
        recorderRef.current = null;
        setRecording(false);
        setProgress('Montaje exportado en ' + extension.toUpperCase() + '. Comprueba el archivo antes de publicarlo.');
      };

      recorder.start(250);
      for (const audio of audioElements) {
        try { await audio.play(); } catch {
          setProgress('No se pudo iniciar uno de los audios. Revisa el archivo y vuelve a exportar.');
          recorder.stop();
          return;
        }
      }

      const started = performance.now();
      const totalMs = Math.max(1000, totalSeconds * 1000);
      let previousIndex = -1;
      let lastProgressUpdate = 0;
      const render = (now: number) => {
        const elapsed = now - started;
        if (stopRef.current || elapsed >= totalMs) {
          recorder.stop();
          audioElements.forEach((audio) => audio.pause());
          return;
        }
        const seconds = elapsed / 1000;
        let index = scenes.length - 1;
        for (let i = 0; i < scenes.length; i++) {
          const end = sceneStarts[i] + Math.max(1, Number(scenes[i].duration) || 1);
          if (seconds < end) { index = i; break; }
        }
        const sceneElapsed = Math.max(0, seconds - sceneStarts[index]);
        const transitionDuration = 0.65;
        const isTransition = index > 0 && sceneElapsed < transitionDuration;
        const alpha = isTransition ? Math.min(1, sceneElapsed / transitionDuration) : 1;
        const oldIndex = isTransition ? index - 1 : -1;
        if (index !== previousIndex) { previousIndex = index; setPreviewIndex(index); }
        drawFrame(index, elapsed, sceneElapsed, alpha, oldIndex);
        if (now - lastProgressUpdate > 450) {
          lastProgressUpdate = now;
          setProgress('Exportando escena ' + (index + 1) + ' de ' + scenes.length + ' · ' + Math.min(100, Math.round(elapsed / totalMs * 100)) + '%');
        }
        rafRef.current = requestAnimationFrame(render);
      };
      rafRef.current = requestAnimationFrame(render);
    } catch (error) {
      audioElements.forEach((audio) => { audio.pause(); audio.src = ''; });
      void audioContext.close();
      setRecording(false);
      setProgress('No se pudo iniciar el montaje. Comprueba los archivos de audio e inténtalo de nuevo.');
    }
  }

  function stopExport() {
    stopRef.current = true;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
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
