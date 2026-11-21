"""Download the recorded evaluation profile and verify every weight before use."""
import hashlib
import json
import tarfile
import urllib.request
from pathlib import Path

root = Path('/models')
manifest = json.loads(Path('jury-runtime.json').read_text())
root.mkdir(exist_ok=True)
archive = root / 'zipformer.tar.bz2'
urllib.request.urlretrieve('https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-zipformer-ru-int8-2025-04-20.tar.bz2', archive)
with tarfile.open(archive) as source:
    target = root / 'sherpa'
    target.mkdir(exist_ok=True)
    for member in source.getmembers():
        resolved = (target / member.name).resolve()
        if not resolved.is_relative_to(target.resolve()) or member.issym() or member.islnk():
            raise RuntimeError('Unsafe model archive')
    source.extractall(target)
urls = {
    'dictation-asr': 'https://huggingface.co/handy-computer/Qwen3-ASR-0.6B-gguf/resolve/main/Qwen3-ASR-0.6B-Q8_0.gguf',
    'tts': 'https://models.silero.ai/models/tts/ru/v5_6_ru.pt',
}
for entry in manifest['files']:
    path = root / entry['path']
    path.parent.mkdir(parents=True, exist_ok=True)
    if entry['component'] in urls:
        urllib.request.urlretrieve(urls[entry['component']], path)
    with path.open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    if path.stat().st_size != entry['bytes'] or digest != entry['sha256']:
        raise RuntimeError(f"Invalid weight: {entry['path']}")
archive.unlink()
