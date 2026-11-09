import { useEffect, useRef, useState } from 'react';
import { Download, Film, Music2, Play, Square, Volume2 } from 'lucide-react';

type EditorScene = { id: string; narration: string; duration: number };
type Props = { scenes: EditorScene[]; imageUrls: Record<string, string>; format: '9:16' | '16:9' };

export default function VideoEditor({ scenes, imageUrls, format }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const voiceRef = useRef<HTMLAudioElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const [voiceUrl, setVoiceUrl] = useState('');
  const [musicUrl, setMusicUrl] = useState('');
  const [voiceName, setVoiceName] = useState('');
  const [musicName, setMusicName] = useState('');
  const [musicVolume, setMusicVolume] = useState(0.18);
  const [voiceVolume, setVoiceVolume] = useState(1);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState('');
  const [previewIndex, setPreviewIndex] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const stopRef = useRef(false);

  useEffect(() => () => {
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    audioContextRef.current?.close();
  }, [voiceUrl, musicUrl]);

  const totalSeconds = scenes.reduce((sum, scene) => sum + Math.max(1, scene.duration || 1), 0);
  const width = format === '9:16' ? 720 : 1280;
  const height = format === '9:16' ? 1280 : 720;

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

  function drawFrame(index: number, elapsed: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const scene = scenes[index];
    ctx.fillStyle = '#10131b';
    ctx.fillRect(0, 0, width, height);
    const url = scene ? imageUrls[scene.id] : '';
    const drawText = () => {
      const caption = scene?.narration?.trim() || 'Añade la narración de esta escena';
      const maxWidth = width * 0.84;
      const fontSize = Math.round(width * 0.045);
      ctx.font = '600 ' + fontSize + 'px Arial';
      const words = caption.split(/\\s+/);
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
        else line = test;
      }
      if (line) lines.push(line);
      const visible = lines.slice(-4);
      const lineHeight = fontSize * 1.28;
      const boxHeight = visible.length * lineHeight + fontSize * 1.2;
      const y = height - height * 0.09;
      ctx.fillStyle = 'rgba(0,0,0,.68)';
      ctx.fillRect(width * 0.06, y - boxHeight, width * 0.88, boxHeight);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      visible.forEach((text, i) => ctx.fillText(text, width / 2, y - boxHeight + fontSize * 0.9 + i * lineHeight, maxWidth));
      ctx.font = '600 ' + Math.round(width * 0.018) + 'px Arial';
      ctx.fillStyle = '#d3caff';
      ctx.fillText('RIKYTECH AI STUDIO  ·  RECONSTRUCCIÓN / MATERIAL VISUAL', width / 2, height * 0.055);
    };
    if (url) {
      const img = new Image();
      img.onload = () => {
        const scale = Math.max(width / img.width, height / img.height);
        const zoom = 1 + Math.min(0.08, elapsed * 0.00015);
        const dw = img.width * scale * zoom;
        const dh = img.height * scale * zoom;
        ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
        drawText();
      };
      img.onerror = drawText;
      img.src = url;
    } else {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#25213e'); gradient.addColorStop(1, '#10131b');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
      drawText();
    }
  }

  function previewScene(index: number) {
    setPreviewIndex(index);
    drawFrame(index, 0);
  }

  async function exportVideo() {
    const canvas = canvasRef.current;
    if (!canvas || !scenes.length) return;
    if (!('MediaRecorder' in window) || !canvas.captureStream) {
      setProgress('Este navegador no admite la exportación de vídeo. Prueba con Chrome actualizado.');
      return;
    }
    if (recording) return;
    setRecording(true);
    setProgress('Preparando montaje…');
    stopRef.current = false;
    const ctx = new AudioContext();
    audioContextRef.current = ctx;
    const destination = ctx.createMediaStreamDestination();
    const voice = voiceRef.current;
    const music = musicRef.current;
    if (voice && voiceUrl) {
      voice.currentTime = 0;
      const source = ctx.createMediaElementSource(voice);
      const gain = ctx.createGain(); gain.gain.value = voiceVolume;
      source.connect(gain); gain.connect(destination); gain.connect(ctx.destination);
    }
    if (music && musicUrl) {
      music.currentTime = 0; music.loop = true;
      const source = ctx.createMediaElementSource(music);
      const gain = ctx.createGain(); gain.gain.value = musicVolume;
      source.connect(gain); gain.connect(destination); gain.connect(ctx.destination);
    }
    await ctx.resume();
    const stream = canvas.captureStream(30);
    destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => { setProgress('No se pudo exportar el vídeo en este navegador.'); setRecording(false); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'rikytech-documental.webm'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      stream.getTracks().forEach((track) => track.stop());
      void ctx.close();
      audioContextRef.current = null;
      setRecording(false);
      setProgress('Montaje exportado. Descarga el archivo WEBM y comprueba su reproducción antes de publicarlo.');
    };
    recorder.start(250);
    if (voice && voiceUrl) { try { await voice.play(); } catch { setProgress('Toca reproducir en el audio de narración y vuelve a exportar.'); recorder.stop(); return; } }
    if (music && musicUrl) { try { await music.play(); } catch { /* Voice and visuals can still export. */ } }
    const started = performance.now();
    const totalMs = Math.max(1000, totalSeconds * 1000);
    let previousIndex = -1;
    const render = (now: number) => {
      const elapsed = now - started;
      if (stopRef.current || elapsed >= totalMs) { recorder.stop(); voice?.pause(); music?.pause(); return; }
      let cursor = elapsed / 1000;
      let index = 0;
      while (index < scenes.length - 1 && cursor >= scenes[index].duration) { cursor -= scenes[index].duration; index += 1; }
      if (index !== previousIndex) { previousIndex = index; setPreviewIndex(index); }
      drawFrame(index, elapsed);
      setProgress('Exportando escena ' + (index + 1) + ' de ' + scenes.length + ' · ' + Math.min(100, Math.round(elapsed / totalMs * 100)) + '%');
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
  }

  function stopExport() {
    stopRef.current = true;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }

  return <section className="video-editor">
    <div className="video-editor-heading"><div><div className="eyebrow">POSTPRODUCCIÓN</div><h2>Editor de montaje</h2><p>Previsualiza las escenas, añade una narración grabada y música, y exporta un vídeo vertical u horizontal con subtítulos de cada escena.</p></div><span className="visual-default">MVP · LOCAL</span></div>
    <div className="editor-workspace">
      <div className="editor-preview">
        <canvas ref={canvasRef} width={width} height={height} aria-label="Vista previa del montaje" />
        <div className="editor-preview-controls">{scenes.map((scene, index) => <button key={scene.id} className={previewIndex === index ? 'active' : ''} onClick={() => previewScene(index)}>{index + 1}</button>)}</div>
      </div>
      <div className="editor-controls">
        <div className="editor-track"><b><Volume2 size={16}/> Narración</b><label className="editor-file-button">Cargar audio de voz<input type="file" accept="audio/*" onChange={(e) => { setAudioFile(e.target.files?.[0], 'voice'); e.currentTarget.value = ''; }}/></label><small>{voiceName || 'Sin archivo de narración'}</small><label>Volumen <input type="range" min="0" max="1.5" step=".05" value={voiceVolume} onChange={(e) => setVoiceVolume(Number(e.target.value))}/></label></div>
        <div className="editor-track"><b><Music2 size={16}/> Música</b><label className="editor-file-button">Cargar música<input type="file" accept="audio/*" onChange={(e) => { setAudioFile(e.target.files?.[0], 'music'); e.currentTarget.value = ''; }}/></label><small>{musicName || 'Sin música de fondo'}</small><label>Volumen <input type="range" min="0" max=".6" step=".02" value={musicVolume} onChange={(e) => setMusicVolume(Number(e.target.value))}/></label></div>
        <audio ref={voiceRef} src={voiceUrl || undefined} preload="auto" />
        <audio ref={musicRef} src={musicUrl || undefined} preload="auto" />
        <div className="editor-track"><b><Film size={16}/> Línea de tiempo</b><small>{scenes.length} escenas · {totalSeconds} segundos estimados · {format}</small><div className="editor-timeline">{scenes.map((scene, index) => <button key={scene.id} onClick={() => previewScene(index)} className={previewIndex === index ? 'active' : ''}><span>{String(index + 1).padStart(2, '0')}</span><small>{scene.duration}s</small></button>)}</div></div>
        <div className="editor-actions"><button className="primary-button" onClick={() => void exportVideo()} disabled={recording || !scenes.length}><Play size={16}/> Exportar vídeo</button>{recording && <button className="secondary-button" onClick={stopExport}><Square size={15}/> Detener</button>}</div>
        {progress && <p className="ai-generator-status" role="status">{progress}</p>}
        <p className="editor-footnote">Exportación local en WEBM (no MP4). Las imágenes, el audio y el proyecto permanecen en este dispositivo. La duración visual sigue la suma de segundos de las escenas; ajusta la duración de la narración para que coincida.</p>
      </div>
    </div>
  </section>;
}
