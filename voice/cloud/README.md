# Contour Speech

CPU-only speech service for a noncommercial jury demonstration. The Docker image downloads the pinned profile and verifies SHA-256 hashes. It does not include GigaChat credentials or user projects.

Set a random `QWEN_VOICE_KEY` (at least 32 characters) as a deployment secret. Listen on port 7860. Vercel uses `/asr` and `/tts` as the respective service URLs, with the same server-side key in the custom `x-contour-service-key` header.

Conversation: Russian Zipformer; dictation: Qwen3-ASR-0.6B GGUF; synthesis: Silero v5.6, male Eugene, mono PCM 48 kHz. Model licenses apply separately; Silero evaluation profile is noncommercial. No promise of uninterrupted free hosting or instant cold starts.

`/tts/speak-stream` delivers NDJSON audio clips over one connection. Browser transport uses MP3 at 128 kbps and 48 kHz, encoded with FFmpeg; the underlying synthesis profile is unchanged. The ordinary `/tts/speak` endpoint retains WAV for reproducible recognition checks.

`/quota` applies a shared daily request cap while the process lives. Restarting the Studio resets this in-memory counter; this is a demonstration safeguard, not durable billing accounting. Audio and transcripts are processed in memory, not retained by this service. Platform infrastructure logging is governed by the host.
