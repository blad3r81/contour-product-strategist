import base64
import argparse
import hmac
import importlib.util
import io
import json
import os
import threading
import wave
from collections import deque
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import soundfile
ASR_ID = 'Qwen/Qwen3-ASR-0.6B'
TTS_ID = 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice'
LOCK = threading.Lock()
VOSK_LOCK = threading.Lock()
PIPER_LOCK = threading.Lock()
ASR_WARMING = threading.Event()
TTS_WARMING = threading.Event()
asr_model = None
tts_model = None
vosk_model = None
piper_voice = None
silero_voice = None
zipformer = None


def zipformer_path():
    folder = os.getenv('CONTOUR_ZIPFORMER_MODEL')
    return Path(folder) if folder and (Path(folder) / 'tokens.txt').is_file() and importlib.util.find_spec('sherpa_onnx') else None


def load_zipformer(path):
    global zipformer
    if zipformer is None:
        from sherpa_onnx import OfflineRecognizer

        def model_part(pattern):
            return str(next(path.glob(pattern)))

        zipformer = OfflineRecognizer.from_transducer(
            encoder=model_part('encoder*.int8.onnx'),
            decoder=model_part('decoder*.onnx'),
            joiner=model_part('joiner*.int8.onnx'),
            tokens=str(path / 'tokens.txt'),
            num_threads=2,
            decoding_method='modified_beam_search',
        )
    return zipformer


def transcribe_zipformer(audio, rate, path):
    with VOSK_LOCK:
        recognizer = load_zipformer(path)
        stream = recognizer.create_stream()
        stream.accept_waveform(rate, audio)
        recognizer.decode_stream(stream)
        return stream.result.text.strip()


def vosk_path():
    folder = os.getenv('CONTOUR_VOSK_MODEL')
    return Path(folder) if folder and (Path(folder) / 'am/final.mdl').is_file() and importlib.util.find_spec('vosk') else None


def load_vosk(path):
    global vosk_model
    if vosk_model is None:
        from vosk import Model, SetLogLevel

        SetLogLevel(-1)
        vosk_model = Model(str(path))
    return vosk_model


def transcribe_vosk(audio, rate, path):
    from vosk import KaldiRecognizer

    with VOSK_LOCK:
        model = load_vosk(path)
    recognizer = KaldiRecognizer(model, rate)
    recognizer.SetWords(True)
    pcm = (audio * 32767).clip(-32767, 32767).astype('<i2').tobytes()
    words = []
    for offset in range(0, len(pcm), 8000):
        if recognizer.AcceptWaveform(pcm[offset:offset + 8000]):
            words.extend(json.loads(recognizer.Result()).get('result', []))
    words.extend(json.loads(recognizer.FinalResult()).get('result', []))
    if not words or sum(word['conf'] for word in words) / len(words) < 0.60:
        return ''
    return ' '.join(word['word'] for word in words)


def compact_asr_path():
    root = os.getenv('QWEN_ASR_DIR')
    if root and importlib.util.find_spec('transcribe_cpp'):
        path = Path(root) / 'Qwen3-ASR-0.6B-Q8_0.gguf'
        if path.is_file():
            return path
    return None


def compact_tts_path():
    path = os.getenv('QWEN_TTS_TMOD')
    if path and Path(path).is_file() and importlib.util.find_spec('vox'):
        return path
    return None


def piper_path(fallback=False):
    path = os.getenv('CONTOUR_PIPER_FALLBACK' if fallback else 'CONTOUR_PIPER_VOICE')
    if path and Path(path).is_file() and Path(path + '.json').is_file() and importlib.util.find_spec('piper'):
        return path
    return None


def prepared_greeting():
    path = Path(os.getenv('QWEN_TTS_DIR', '')) / 'ryan-greeting.wav'
    return path if os.getenv('QWEN_SPEAKER', 'Ryan') == 'Ryan' and not piper_path() and path.is_file() else None


def model_location(action):
    root = os.getenv('QWEN_ASR_DIR' if action == 'transcribe' else 'QWEN_TTS_DIR')
    if root and (Path(root) / 'model.safetensors').is_file() and (Path(root) / 'vocab.json').is_file():
        if action == 'transcribe' or (Path(root) / 'speech_tokenizer/model.safetensors').is_file():
            return root
    return ASR_ID if action == 'transcribe' else TTS_ID


def model_is_ready(action):
    if action == 'transcribe' and (zipformer_path() or vosk_path() or compact_asr_path()):
        return True
    if action == 'speak' and (silero_path() or piper_path() or piper_path(fallback=True) or compact_tts_path()):
        return True
    model = model_location(action)
    if model not in (ASR_ID, TTS_ID):
        return True
    home = Path(os.getenv('HF_HOME', Path.home() / '.cache/huggingface'))
    cache = Path(os.getenv('HF_HUB_CACHE', home / 'hub')) / ('models--' + model.replace('/', '--'))
    try:
        revision = (cache / 'refs/main').read_text(encoding='utf-8').strip()
    except OSError:
        return False
    snapshot = cache / 'snapshots' / revision
    files = ['model.safetensors', 'vocab.json']
    if action == 'speak':
        files.append('speech_tokenizer/model.safetensors')
    return all((snapshot / file).is_file() for file in files)


def contains_speech(audio, rate):
    import webrtcvad

    detector = webrtcvad.Vad(2)
    samples_per_frame = rate // 50
    pcm = (audio * 32767).astype('<i2').tobytes()
    frame_bytes = samples_per_frame * 2
    recent = deque(maxlen=12)
    for offset in range(0, len(pcm) - frame_bytes + 1, frame_bytes):
        recent.append(detector.is_speech(pcm[offset:offset + frame_bytes], rate))
        if sum(recent) >= 8:
            return True
    return False


def transcribe(encoded, speech_only=False):
    audio, rate = soundfile.read(io.BytesIO(base64.b64decode(encoded, validate=True)), dtype='float32')
    if audio.ndim != 1 or rate != 16000 or len(audio) > 80 * rate:
        raise ValueError('Нужен монофонический WAV длительностью до 80 секунд.')
    peak = float(abs(audio).max()) if len(audio) else 0.0
    if peak < 0.005:
        return {'text': ''}
    if speech_only and not contains_speech(audio, rate):
        return {'text': ''}
    if peak < 0.18:
        audio *= min(2.5, 0.18 / peak)
    if speech_only and (path := zipformer_path()):
        try:
            return {'text': transcribe_zipformer(audio, rate, path), 'engine': 'zipformer'}
        except Exception as error:
            print(f'Zipformer: {type(error).__name__}: {error}', flush=True)
    if speech_only and (path := vosk_path()):
        return {'text': transcribe_vosk(audio, rate, path), 'engine': 'vosk'}
    with LOCK:
        return recognize(audio, rate, speech_only)


def load_compact_asr(path):
    global asr_model
    if asr_model is None:
        from transcribe_cpp import Model

        asr_model = Model(str(path), backend=os.getenv('QWEN_ASR_BACKEND', 'cpu'))
    return asr_model


def recognize(audio, rate, speech_only):
    global asr_model

    if path := compact_asr_path():
        from transcribe_cpp import Aborted

        with load_compact_asr(path).session(n_threads=4) as session:
            timer = threading.Timer(48, session.cancel) if speech_only else None
            if timer:
                timer.start()
            try:
                result = session.run(audio, language='ru')
            except Aborted as error:
                raise TimeoutError('Распознавание заняло слишком много времени. Повторите фразу.') from error
            finally:
                if timer:
                    timer.cancel()
                    timer.join()
        return {'text': result.text.strip()}

    import torch
    from qwen_asr import Qwen3ASRModel

    if asr_model is None:
        torch.set_num_threads(max(1, min(6, os.cpu_count() or 1)))
        asr_model = Qwen3ASRModel.from_pretrained(model_location('transcribe'), local_files_only=True, dtype=torch.float32, device_map='cpu', max_new_tokens=1024)
    with torch.inference_mode():
        result = asr_model.transcribe(audio=(audio, rate), language='Russian')
    return {'text': result[0].text.strip() if result else ''}


def warm_asr(load, path, lock):
    try:
        with lock:
            load(path)
    except Exception as error:
        print(f'ASR warm-up: {type(error).__name__}: {error}', flush=True)
    finally:
        ASR_WARMING.clear()


def synthesize(text):
    global tts_model
    speaker = os.getenv('QWEN_SPEAKER', 'Ryan')
    path = compact_tts_path()
    if path:
        if tts_model is None:
            from vox import Engine

            tts_model = Engine(path, device=os.getenv('QWEN_TTS_DEVICE', 'auto'), threads=4)
        voice = tts_model.speaker_voice(speaker)
        wave = tts_model.synthesize(text, voice, language='russian')
        return wave, tts_model.sample_rate

    import torch
    from qwen_tts import Qwen3TTSModel

    if tts_model is None:
        torch.set_num_threads(max(1, min(6, os.cpu_count() or 1)))
        tts_model = Qwen3TTSModel.from_pretrained(model_location('speak'), local_files_only=True, dtype=torch.float32, device_map='cpu')
    with torch.inference_mode():
        waves, sample_rate = tts_model.generate_custom_voice(text=text, language='Russian', speaker=speaker)
    return waves[0], sample_rate


def speak(text):
    if not isinstance(text, str) or not text.strip() or len(text) > 2200:
        raise ValueError('Нужен текст длиной до 2200 символов.')
    return render_speech(text)


def speak_piper(text, path):
    from piper import PiperVoice, SynthesisConfig

    global piper_voice
    with PIPER_LOCK:
        if piper_voice is None or piper_voice[0] != path:
            piper_voice = (path, PiperVoice.load(path))
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as output:
            piper_voice[1].synthesize_wav(text, output, syn_config=SynthesisConfig(length_scale=1.03, volume=0.82))
        sample_rate = piper_voice[1].config.sample_rate
    return {'audio': base64.b64encode(buffer.getvalue()).decode('ascii'), 'engine': 'piper', 'sampleRate': sample_rate}


def silero_path():
    path = os.getenv('CONTOUR_SILERO_MODEL')
    return Path(path) if path and Path(path).is_file() and importlib.util.find_spec('torch') else None


def speak_silero(text, path):
    import torch

    global silero_voice
    with PIPER_LOCK:
        if silero_voice is None:
            torch.set_num_threads(2)
            silero_voice = torch.package.PackageImporter(str(path)).load_pickle('tts_models', 'model')
        with torch.inference_mode():
            samples = silero_voice.apply_tts(text=text, speaker=os.getenv('CONTOUR_SILERO_SPEAKER', 'eugene'), sample_rate=48000).numpy()
        peak = float(abs(samples).max()) if len(samples) else 0.0
        if peak > 0.88:
            samples *= 0.88 / peak
    buffer = io.BytesIO()
    soundfile.write(buffer, samples, 48000, format='WAV', subtype='PCM_16')
    return {'audio': base64.b64encode(buffer.getvalue()).decode('ascii'), 'engine': 'silero', 'sampleRate': 48000}


def warm_tts(path):
    try:
        speak_silero('Добрый день.', path)
    except Exception as error:
        print(f'Silero warm-up: {type(error).__name__}: {error}', flush=True)
    finally:
        TTS_WARMING.clear()


@lru_cache(maxsize=4)
def render_speech(text):
    if path := piper_path():
        return speak_piper(text, path)
    buffer = io.BytesIO()
    samples, sample_rate = synthesize(text)
    soundfile.write(buffer, samples, sample_rate, format='WAV', subtype='PCM_16')
    return {'audio': base64.b64encode(buffer.getvalue()).decode('ascii')}


class Handler(BaseHTTPRequestHandler):
    def respond(self, status, result):
        encoded = json.dumps(result, ensure_ascii=False).encode('utf-8')
        try:
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
        except ConnectionError:
            pass

    def do_GET(self):
        if self.path == '/health':
            self.respond(200, {'ok': True, 'ready': not ASR_WARMING.is_set() and not TTS_WARMING.is_set() and model_is_ready(self.server.action[1:])})
        else:
            self.respond(404, {'error': 'Команда не найдена.'})

    def do_POST(self):
        key = os.getenv('QWEN_VOICE_KEY')
        if key and not hmac.compare_digest(self.headers.get('Authorization', ''), f'Bearer {key}'):
            return self.respond(401, {'error': 'Неверный ключ голосового сервиса.'})
        if self.path != self.server.action:
            return self.respond(404, {'error': 'Команда не найдена.'})
        if not model_is_ready(self.path[1:]):
            return self.respond(503, {'error': 'Голосовые веса Qwen ещё не загружены на этот компьютер.'})
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 4_000_000:
                raise ValueError('Размер тела запроса должен быть меньше 4 МБ.')
            payload = json.loads(self.rfile.read(length))
            if self.path == '/transcribe':
                speech_only = payload.get('speechOnly') is True
                if speech_only and not importlib.util.find_spec('webrtcvad'):
                    return self.respond(503, {'error': 'Для голосового разговора установите webrtcvad-wheels в окружение распознавания речи.'})
                result = transcribe(payload['audio'], speech_only)
            elif payload.get('prepared') is True and not (payload.get('fast') is True and silero_path()) and (path := prepared_greeting()):
                result = {'audio': base64.b64encode(path.read_bytes()).decode('ascii')}
            elif payload.get('fast') is True:
                text = payload['text']
                if not isinstance(text, str) or not text.strip() or len(text) > 2200:
                    raise ValueError('Нужен текст длиной до 2200 символов.')
                if path := silero_path():
                    try:
                        return self.respond(200, speak_silero(text, path))
                    except Exception as error:
                        print(f'Silero: {type(error).__name__}: {error}', flush=True)
                if not (path := piper_path(fallback=True)):
                    return self.respond(503, {'error': 'Резервная озвучка не настроена.'})
                result = speak_piper(text, path)
            elif not LOCK.acquire(blocking=False):
                return self.respond(503, {'error': 'Основная озвучка занята.'})
            else:
                try:
                    result = speak(payload['text'])
                finally:
                    LOCK.release()
            self.respond(200, result)
        except (ValueError, KeyError) as error:
            self.respond(400, {'error': str(error)})
        except TimeoutError as error:
            self.respond(504, {'error': str(error)})
        except Exception as error:
            print(f'{self.path}: {type(error).__name__}: {error}', flush=True)
            self.respond(502, {'error': 'Голосовая модель Qwen не ответила. Проверьте локальный сервис.'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['transcribe', 'speak'])
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--cache-model', action='store_true')
    args = parser.parse_args()
    if args.cache_model:
        from huggingface_hub import snapshot_download
        snapshot_download(ASR_ID if args.action == 'transcribe' else TTS_ID)
    else:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
        server.action = '/' + args.action
        if args.action == 'transcribe':
            preferred = zipformer_path()
            path = preferred or vosk_path()
            load = load_zipformer if preferred else load_vosk if path else load_compact_asr
            lock = VOSK_LOCK if path else LOCK
            path = path or compact_asr_path()
        else:
            path = None
        if path:
            ASR_WARMING.set()
            threading.Thread(target=warm_asr, args=(load, path, lock), daemon=True).start()
        if args.action == 'speak' and (profile := silero_path()):
            TTS_WARMING.set()
            threading.Thread(target=warm_tts, args=(profile,), daemon=True).start()
        server.serve_forever()
