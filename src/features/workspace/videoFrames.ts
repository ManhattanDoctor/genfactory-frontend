/** Local visual sampling only; no audio analysis or upload of the source video. */
export async function videoFrames(file: File): Promise<File[]> {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  const url = URL.createObjectURL(file);
  video.src = url;
  const wait = (name: string) =>
    new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        video.removeEventListener(name, ok);
        video.removeEventListener('error', bad);
        error ? reject(error) : resolve();
      };
      const ok = () => finish();
      const bad = () =>
        finish(new Error('Не удалось прочитать видео. Используйте MP4/WebM или загрузите кадр.'));
      const timer = setTimeout(() => finish(new Error('Чтение видео заняло слишком много времени.')), 15000);
      video.addEventListener(name, ok, { once: true });
      video.addEventListener('error', bad, { once: true });
    });
  try {
    await wait('loadeddata');
    if (!Number.isFinite(video.duration) || !video.videoWidth)
      throw new Error('Не удалось определить длительность видео.');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1536 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const output: File[] = [];
    for (const fraction of [0.1, 0.5, 0.9]) {
      const at = video.duration * fraction;
      const seek = wait('seeked');
      video.currentTime = at;
      await seek;
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Не удалось извлечь кадр.'))),
          'image/jpeg',
          0.85,
        ),
      );
      output.push(
        new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-frame-${at.toFixed(1)}s.jpg`, {
          type: 'image/jpeg',
        }),
      );
    }
    return output;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
