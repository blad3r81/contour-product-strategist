import { useEffect, useRef, useState } from 'react';
import { base64 } from './chat-files';
import { speechParts } from './voice-text';

type Mode = 'call' | 'dictation';
type Phase = 'Подключаю микрофон' | 'Слушаю' | 'Распознаю речь' | 'Думаю' | 'Готовлю голосовой ответ' | 'Отвечаю';
type Options = {
  request: (action: string, payload: object, signal?: AbortSignal) => Promise<{ text?: string; audio?: string }>;
  requestSpeech: (parts: string[], signal: AbortSignal, onAudio: (audio: string) => void) => Promise<void>;
  onSpeechStart: () => void;
  onDictation: (text: string) => void;
  onTurn: (text: string, onPreview: (text: string) => void, onSpeechStatus: (text: string) => void) => Promise<string | undefined>;
  cancelTurn: () => void;
  report: (message: string) => void;
};
type VoiceRuntime = { context: AudioContext; output: AudioNode; stream?: MediaStream; mode: Mode; frames: Float32Array[]; pending: Promise<void>; turn?: AbortController; muted: boolean; resumeAfter: number; voiced: boolean; silence: number; elapsed: number; lead: Float32Array[]; peak: number; noiseFloor: number; stopped: boolean };

function resetCapture(state: VoiceRuntime) {
  state.frames = [];
  state.lead = [];
  state.peak = 0;
  state.elapsed = 0;
  state.silence = 0;
  state.voiced = false;
}

function voiceOutput(context: AudioContext) {
  const gain = context.createGain();
  gain.gain.value = 0.72;
  const peaks = context.createDynamicsCompressor();
  peaks.threshold.value = -5;
  peaks.knee.value = 2;
  peaks.ratio.value = 2;
  peaks.attack.value = 0.005;
  peaks.release.value = 0.14;
  gain.connect(peaks).connect(context.destination);
  return gain;
}

function decodeAudio(context: AudioContext, base64: string) {
  const buffer = Uint8Array.from(atob(base64), value => value.charCodeAt(0));
  return context.decodeAudioData(buffer.buffer);
}

function wav(frames: Float32Array[], rate: number): Blob {
  const samples = frames.reduce((count, frame) => count + frame.length, 0);
  const length = Math.floor(samples * 16000 / rate);
  const joined = new Float32Array(samples);
  let offset = 0;
  for (const frame of frames) { joined.set(frame, offset); offset += frame.length; }
  const bytes = new DataView(new ArrayBuffer(44 + length * 2));
  function ascii(at: number, text: string) {
    for (let index = 0; index < text.length; index++) bytes.setUint8(at + index, text.charCodeAt(index));
  }
  ascii(0, 'RIFF'); bytes.setUint32(4, bytes.byteLength - 8, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
  bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true);
  bytes.setUint32(24, 16000, true); bytes.setUint32(28, 32000, true);
  bytes.setUint16(32, 2, true); bytes.setUint16(34, 16, true); ascii(36, 'data'); bytes.setUint32(40, length * 2, true);
  for (let index = 0; index < length; index++) {
    const from = Math.floor(index * rate / 16000);
    const to = Math.max(from + 1, Math.floor((index + 1) * rate / 16000));
    let sum = 0;
    for (let i = from; i < to; i++) sum += joined[i] || 0;
    bytes.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sum / (to - from))) * 32767, true);
  }
  return new Blob([bytes.buffer], { type: 'audio/wav' });
}

export function useVoiceChat(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [mode, setMode] = useState<Mode>();
  const [phase, setPhase] = useState<Phase>('Слушаю');
  const [muted, setMuted] = useState(false);
  const orb = useRef<HTMLDivElement>(null);
  const runtime = useRef<VoiceRuntime | undefined>(undefined);
  const playback = useRef<{ abort: AbortController; source?: AudioBufferSourceNode; animation?: number } | undefined>(undefined);

  function level(value: number) { orb.current?.style.setProperty('--voice-level', String(Math.min(1, value))); }
  function interrupt() {
    const play = playback.current;
    if (!play) return;
    play.source?.stop();
    play.abort.abort();
    if (play.animation !== undefined) cancelAnimationFrame(play.animation);
    playback.current = undefined;
    level(0);
  }

  async function say(text: string, state: NonNullable<typeof runtime.current>) {
    interrupt();
    const play: NonNullable<typeof playback.current> = { abort: new AbortController() };
    playback.current = play;
    const parts = speechParts(text);
    if (!parts.length) return;
    const clips: Promise<{ buffer?: AudioBuffer; error?: Error }>[] = [];
    let done = false;
    let failure: Error | undefined;
    let notify: (() => void) | undefined;
    const wake = () => { notify?.(); notify = undefined; };
    play.abort.signal.addEventListener('abort', wake, { once: true });
    const synthesis = latest.current.requestSpeech(parts, play.abort.signal, audio => {
      clips.push(decodeAudio(state.context, audio).then(buffer => ({ buffer }), (error: Error) => ({ error })));
      wake();
    }).catch((error: Error) => { failure = error; }).finally(() => { done = true; wake(); });
    while (!done || clips.length) {
      if (play.abort.signal.aborted || state.stopped) break;
      if (!clips.length) {
        setPhase('Готовлю голосовой ответ');
        await new Promise<void>(resolve => { notify = resolve; });
        continue;
      }
      const { buffer, error } = await clips.shift()!;
      if (play.abort.signal.aborted || state.stopped) break;
      if (error) throw error;
      if (!buffer) throw Error('Озвучить ответ не удалось. Текст доступен в чате.');
      if (play.abort.signal.aborted || state.stopped) break;
      const source = state.context.createBufferSource();
      const analyser = state.context.createAnalyser();
      analyser.fftSize = 256;
      const samples = new Float32Array(analyser.fftSize);
      function animate() {
        analyser.getFloatTimeDomainData(samples);
        level(Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length) * 5);
        play.animation = requestAnimationFrame(animate);
      }
      play.source = source;
      source.buffer = buffer;
      source.connect(analyser).connect(state.output);
      setPhase('Отвечаю');
      await new Promise<void>((resolve, reject) => {
        const abort = () => finish();
        const watchdog = window.setTimeout(() => {
          source.stop();
          finish(Error('Воспроизведение прервалось. Ответ доступен в чате.'));
        }, buffer.duration * 1000 + 2000);
        function finish(error?: Error) {
          clearTimeout(watchdog);
          play.abort.signal.removeEventListener('abort', abort);
          source.onended = null;
          if (play.animation !== undefined) cancelAnimationFrame(play.animation);
          source.disconnect(); analyser.disconnect();
          play.source = undefined;
          if (playback.current === play) level(0);
          if (error) reject(error);
          else resolve();
        }
        source.onended = () => finish();
        play.abort.signal.addEventListener('abort', abort, { once: true });
        source.start(); latest.current.onSpeechStart(); animate();
      });
    }
    play.abort.signal.removeEventListener('abort', wake);
    await synthesis;
    if (failure && !play.abort.signal.aborted) throw failure;
  }

  async function answerInCall(state: VoiceRuntime, turn: AbortController, send: (preview: (text: string) => void, status: (text: string) => void) => Promise<string | undefined>) {
    // Text can stream immediately. Speech uses the completed answer in one audio
    // connection, so a short preview cannot become a disconnected first sentence.
    const answer = await send(() => {}, () => {});
    if (answer && !turn.signal.aborted && !state.stopped) {
      await say(answer, state);
    }
  }

  function finishTurn(state: VoiceRuntime, turn: AbortController) {
    if (state.stopped || state.turn !== turn) return;
    state.turn = undefined;
    state.resumeAfter = performance.now() + 260;
    interrupt();
    setPhase('Слушаю');
  }

  function stopAnswer() {
    const state = runtime.current;
    if (!state?.turn) return;
    const turn = state.turn;
    turn.abort();
    latest.current.cancelTurn();
    finishTurn(state, turn);
  }

  function flush(state: NonNullable<typeof runtime.current>) {
    const frames = state.frames;
    resetCapture(state);
    if (!frames.length) return;
    const audio = wav(frames, state.context.sampleRate);
    if (audio.size < 4500) return;
    const turn = state.mode === 'call' ? new AbortController() : undefined;
    if (turn) state.turn = turn;
    const processAudio = async () => {
      if (turn && (state.stopped || turn.signal.aborted)) return;
      let result;
      if (turn) {
        const phaseDelay = window.setTimeout(() => setPhase('Распознаю речь'), 650);
        const deadline = AbortSignal.timeout(12000);
        try {
          result = await latest.current.request('transcribe', { audio: await base64(audio), speechOnly: true }, AbortSignal.any([turn.signal, deadline]));
        } catch (error) {
          if (deadline.aborted && !turn.signal.aborted) throw Error('Распознавание не ответило. Скажите фразу ещё раз.');
          throw error;
        } finally {
          clearTimeout(phaseDelay);
        }
      } else {
        setPhase('Распознаю речь');
        result = await latest.current.request('transcribe', { audio: await base64(audio) });
      }
      if (!result.text?.trim()) return;
      if (state.mode === 'dictation') latest.current.onDictation(result.text.trim());
      else if (turn && !turn.signal.aborted && !state.stopped) {
        setPhase('Думаю');
        await answerInCall(state, turn, (preview, status) => latest.current.onTurn(result.text!.trim(), preview, status));
      }
    };
    const run = (turn ? processAudio() : state.pending.then(processAudio)).catch(error => {
      if (!turn?.signal.aborted && error.name !== 'AbortError') latest.current.report(error.message);
    }).finally(() => {
      if (turn) finishTurn(state, turn);
      else if (!state.stopped) setPhase('Слушаю');
    });
    if (!turn) state.pending = run;
  }

  async function start(next: Mode) {
    if (runtime.current) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      latest.current.report('Доступ к микрофону требует HTTPS или локального адреса.'); return;
    }
    const context = new AudioContext({ latencyHint: 'interactive' });
    const state: VoiceRuntime = { context, output: voiceOutput(context), mode: next, frames: [], pending: Promise.resolve(), muted: false, resumeAfter: 0, voiced: false, silence: 0, elapsed: 0, lead: [], peak: 0, noiseFloor: 0.004, stopped: false };
    runtime.current = state;
    setMode(next); setMuted(false); setPhase('Подключаю микрофон');
    try {
      await context.resume();
      state.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: next === 'dictation', channelCount: 1 } });
      if (state.stopped) { state.stream.getTracks().forEach(track => track.stop()); return; }
      state.stream.getAudioTracks().forEach(track => { track.enabled = !state.muted; });
      await context.audioWorklet.addModule('/contour-microphone.js');
      if (state.stopped) return;
      const processor = new AudioWorkletNode(context, 'contour-microphone');
      const microphone = context.createMediaStreamSource(state.stream);
      const micFilter = context.createBiquadFilter();
      micFilter.type = 'highpass';
      micFilter.frequency.value = 80;
      micFilter.Q.value = 0.7;
      microphone.connect(micFilter).connect(processor);
      const silentOutput = context.createGain();
      silentOutput.gain.value = 0;
      processor.connect(silentOutput).connect(context.destination);
      if (!state.turn) setPhase('Слушаю');
      processor.port.onmessage = ({ data: frame }: MessageEvent<Float32Array>) => {
        if (state.stopped || state.muted || state.turn || performance.now() < state.resumeAfter) return;
        const ms = frame.length * 1000 / context.sampleRate;
        let power = 0;
        let crest = 0;
        for (const sample of frame) {
          power += sample * sample;
          crest = Math.max(crest, Math.abs(sample));
        }
        const rms = Math.sqrt(power / frame.length);
        const audible = rms > Math.max(0.004, state.noiseFloor * 2.6) && crest < rms * 9;
        if (!state.voiced && !audible) state.noiseFloor = state.noiseFloor * 0.95 + Math.min(rms, 0.015) * 0.05;
        state.peak = audible ? state.peak + ms : Math.max(0, state.peak - ms * 1.4);
        if (next === 'call' && !state.voiced) {
          const leadFrames = Math.ceil(420 / ms);
          state.lead = [...state.lead.slice(-(leadFrames - 1)), frame];
          if (state.peak < 105) return;
          state.frames = state.lead; state.lead = []; state.voiced = true;
        } else state.frames.push(frame);
        state.elapsed += ms;
        state.silence = audible ? 0 : state.silence + ms;
        const pause = state.elapsed < 4500 ? 680 : 900;
        if (state.elapsed > 65000 || (next === 'call' && state.silence >= pause)) flush(state);
      };
    } catch (error) {
      if (!state.stopped) { stop(); latest.current.report(error instanceof Error && error.name === 'NotAllowedError' ? 'Разрешите микрофон для этой страницы и попробуйте снова.' : 'Не удалось запустить микрофон.'); }
    }
  }

  function toggleMute() {
    const state = runtime.current;
    if (state?.mode !== 'call') return;
    state.muted = !state.muted;
    resetCapture(state);
    state.stream?.getAudioTracks().forEach(track => { track.enabled = !state.muted; });
    setMuted(state.muted);
  }

  function stop() {
    const state = runtime.current;
    if (!state) return;
    state.stopped = true;
    state.turn?.abort();
    if (state.mode === 'call') latest.current.cancelTurn();
    runtime.current = undefined;
    interrupt();
    state.stream?.getTracks().forEach(track => track.stop());
    if (state.mode === 'dictation') flush(state);
    void state.context.close().catch(() => {});
    setMode(undefined);
  }

  function submitInCall(send: (preview?: (text: string) => void, status?: (text: string) => void) => Promise<string | undefined>) {
    const state = runtime.current;
    if (state?.mode !== 'call') { void send(); return; }
    stopAnswer();
    resetCapture(state);
    const turn = new AbortController();
    state.turn = turn;
    setPhase('Думаю');
    void answerInCall(state, turn, send).catch(error => {
      if (!turn.signal.aborted && error.name !== 'AbortError') latest.current.report(error.message);
    }).finally(() => finishTurn(state, turn));
  }

  useEffect(() => () => {
    const state = runtime.current;
    if (!state) return;
    state.frames = [];
    stop();
  }, []);

  return { mode, phase, muted, toggleMute, orb, start, stop, stopAnswer, submitInCall };
}
