"""Bounded HTTP bridge. No project documents, API credentials or transcripts are stored."""
import datetime
import base64
import io
import hmac
import json
import os
import subprocess
import sys
import threading
import urllib.error
import urllib.request
import wave
from urllib.parse import urlsplit
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

KEY = os.environ.get('QWEN_VOICE_KEY', '')
if len(KEY) < 32:
    raise RuntimeError('Set QWEN_VOICE_KEY as a Studio secret (at least 32 characters)')
workers = [subprocess.Popen([sys.executable, 'qwen_voice.py', action, '--port', str(port)]) for action, port in [('transcribe', 9460), ('speak', 9461)]]
slots = threading.BoundedSemaphore(3)
quota_lock = threading.Lock()
day, total, sessions = '', 0, {}


def compressed_speech(result):
    audio = base64.b64decode(result['audio'], validate=True)
    with wave.open(io.BytesIO(audio)) as source:
        duration = source.getnframes() / source.getframerate()
    encoded = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '128k', '-ar', '48000', '-ac', '1', '-f', 'mp3', 'pipe:1'], input=audio, capture_output=True, check=True, timeout=8).stdout
    return {**result, 'audio': base64.b64encode(encoded).decode('ascii'), 'format': 'mp3', 'durationSeconds': duration}


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def respond(self, status, value):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except ConnectionError:
            pass

    def log_message(self, *_):
        pass  # No request bodies, audio or session identifiers in application logs.

    def do_GET(self):
        self.path = urlsplit(self.path).path
        if self.path == '/':
            return self.respond(200, {'service': 'Contour speech', 'profile': 'jury-current-cpu-2026-11-19'})
        if self.path not in ['/asr/health', '/tts/health']:
            return self.respond(404, {'error': 'Not found'})
        self.proxy(9460 if self.path.startswith('/asr') else 9461, '/health')

    def do_POST(self):
        self.path = urlsplit(self.path).path
        global day, total, sessions
        if not hmac.compare_digest(self.headers.get('x-contour-service-key', '').encode(), KEY.encode()):
            return self.respond(401, {'error': 'Unauthorized'})
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 4000000:
                return self.respond(413, {'error': 'Request too large'})
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError()
        except (ValueError, TypeError):
            return self.respond(400, {'error': 'Invalid JSON'})
        if self.path == '/quota':
            session = data.get('session')
            if not isinstance(session, str) or len(session) != 36:
                return self.respond(400, {'error': 'Invalid session'})
            with quota_lock:
                today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
                if day != today:
                    day, total, sessions = today, 0, {}
                if total >= int(os.getenv('CONTOUR_DAILY_CHATS', '150')) or sessions.get(session, 0) >= 35:
                    return self.respond(429, {'error': 'Daily demonstration quota reached'})
                total += 1
                sessions[session] = sessions.get(session, 0) + 1
            return self.respond(200, {'ok': True})
        if self.path == '/tts/speak-stream':
            parts = data.get('parts')
            if not isinstance(parts, list) or not 0 < len(parts) <= 16 or any(not isinstance(part, str) or not part.strip() or len(part) > 440 for part in parts) or sum(map(len, parts)) > 2200:
                return self.respond(400, {'error': 'Invalid speech parts'})
            if not slots.acquire(blocking=False):
                return self.respond(503, {'error': 'Речевой сервер занят. Повторите чуть позже.'})
            try:
                self.send_response(200)
                self.send_header('Content-Type', 'application/x-ndjson; charset=utf-8')
                self.send_header('Cache-Control', 'no-store, no-transform')
                self.send_header('X-Accel-Buffering', 'no')
                self.send_header('Transfer-Encoding', 'chunked')
                self.end_headers()
                def emit(value):
                    encoded = (json.dumps(value, ensure_ascii=False) + '\n').encode()
                    self.wfile.write(f'{len(encoded):X}\r\n'.encode() + encoded + b'\r\n')
                    self.wfile.flush()
                try:
                    for part in parts:
                        request = urllib.request.Request('http://127.0.0.1:9461/speak', data=json.dumps({'text': part, 'fast': True}).encode(), headers={'Content-Type': 'application/json', 'x-contour-service-key': KEY})
                        with urllib.request.urlopen(request, timeout=45) as response:
                            emit(compressed_speech(json.load(response)))
                    emit({'done': True})
                except (ConnectionError, BrokenPipeError):
                    return
                except Exception:
                    emit({'error': 'Озвучка прервалась. Полный ответ доступен в чате.'})
                self.wfile.write(b'0\r\n\r\n')
                self.wfile.flush()
            finally:
                slots.release()
            return
        paths = {'/asr/transcribe': (9460, '/transcribe'), '/tts/speak': (9461, '/speak')}
        if self.path not in paths:
            return self.respond(404, {'error': 'Not found'})
        if not slots.acquire(blocking=False):
            return self.respond(503, {'error': 'Речевой сервер занят. Повторите чуть позже.'})
        try:
            if self.path == '/tts/speak':
                data['fast'] = True
            self.proxy(*paths[self.path], data)
        finally:
            slots.release()

    def proxy(self, port, path, data=None):
        try:
            request = urllib.request.Request(f'http://127.0.0.1:{port}{path}', data=None if data is None else json.dumps(data).encode(), headers={'Content-Type': 'application/json', 'x-contour-service-key': KEY})
            with urllib.request.urlopen(request, timeout=150 if path == '/transcribe' else 45) as response:
                self.respond(response.status, json.load(response))
        except urllib.error.HTTPError as error:
            self.respond(error.code, json.load(error))
        except Exception:
            self.respond(503, {'ok': True, 'ready': False, 'error': 'Речевой сервер запускается или недоступен.'})


try:
    ThreadingHTTPServer(('0.0.0.0', int(os.getenv('PORT', '7860'))), Handler).serve_forever()
finally:
    for worker in workers:
        worker.terminate()
