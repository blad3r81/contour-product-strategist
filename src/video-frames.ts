import { base64 } from './chat-files';

export const isVideo = (name: string) => /\.(mp4|webm)$/i.test(name);

/** Only sampled visual evidence is sent to the image model; audio is not decoded. */
export async function videoFrames(file: File, signal: AbortSignal) {
  if (file.size > 2_000_000) throw Error('Видео превышает 2 МБ.');
  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  function ready(event: string, action: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        video.removeEventListener(event, success);
        video.removeEventListener('error', failed);
        signal.removeEventListener('abort', aborted);
        error ? reject(error) : resolve();
      };
      const success = () => finish();
      const failed = () => finish(Error('Браузер не смог декодировать видео. Попробуйте MP4 H.264 или приложите скриншоты.'));
      const aborted = () => finish(Error('Подготовка видео отменена.'));
      const timer = setTimeout(() => finish(Error('Подготовка кадров заняла больше 12 секунд. Приложите скриншоты.')), 12000);
      video.addEventListener(event, success, { once: true });
      video.addEventListener('error', failed, { once: true });
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted();
      else action();
    });
  }
  try {
    await ready('loadeddata', () => { video.src = url; video.load(); });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || duration > 60) throw Error('Поддерживается видео длительностью до 60 секунд.');
    if (!video.videoWidth || !video.videoHeight) throw Error('В видео не найдено изображение.');
    const sampledSeconds = [0, duration / 3, duration * 2 / 3, Math.max(0, duration - .1)].map(t => Math.round(t * 1000) / 1000);
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('Браузер не поддерживает извлечение кадров.');
    ctx.fillStyle = '#10151a'; ctx.fillRect(0, 0, 1024, 640);
    for (const [index, time] of sampledSeconds.entries()) {
      if (signal.aborted) throw Error('Подготовка видео отменена.');
      if (Math.abs(video.currentTime - time) > .001) await ready('seeked', () => { video.currentTime = time; });
      const x = index % 2 * 512, y = Math.floor(index / 2) * 320;
      const scale = Math.min(512 / video.videoWidth, 288 / video.videoHeight);
      const w = video.videoWidth * scale, h = video.videoHeight * scale;
      ctx.drawImage(video, x + (512 - w) / 2, y + (288 - h) / 2, w, h);
      ctx.fillStyle = '#ffffff'; ctx.font = '18px Arial';
      ctx.fillText(`Frame ${index + 1} | ${time.toFixed(2)} s`, x + 12, y + 312);
    }
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('Не удалось сохранить кадры видео.')), 'image/jpeg', .86));
    return { name: `${file.name}.frames.jpg`, base64: await base64(blob), video: { name: file.name, durationSeconds: duration, sampledSeconds, audio: false } };
  } finally {
    video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url);
  }
}
