param([string]$AiRoot = 'D:\AI', [int]$AsrPort = 9460, [int]$TtsPort = 9461, [switch]$Vulkan, [switch]$QwenSpeech)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $AiRoot | Out-Null
$env:HF_HOME = Join-Path $AiRoot 'cache\huggingface'
$env:PYTHONUTF8 = '1'
if (!$env:OLLAMA_MODELS) { $env:OLLAMA_MODELS = Join-Path $AiRoot 'models\ollama' }
if (!$env:OLLAMA_MAX_QUEUE) { $env:OLLAMA_MAX_QUEUE = '4' }
$env:QWEN_ASR_DIR = Join-Path $AiRoot 'models\qwen-asr'
if (!$env:CONTOUR_ZIPFORMER_MODEL) {
    $env:CONTOUR_ZIPFORMER_MODEL = Join-Path $AiRoot 'models\sherpa\sherpa-onnx-zipformer-ru-int8-2025-04-20'
}
if (!$env:CONTOUR_VOSK_MODEL) {
    $env:CONTOUR_VOSK_MODEL = Join-Path $AiRoot 'models\vosk\vosk-model-small-ru-0.22'
}
$env:QWEN_TTS_DIR = Join-Path $AiRoot 'models\qwen-tts'
if (!$env:CONTOUR_SILERO_MODEL) {
    $candidate = Join-Path $AiRoot 'models\silero\v5_6_ru.pt'
    if (Test-Path -LiteralPath $candidate) { $env:CONTOUR_SILERO_MODEL = $candidate }
}
if (!$env:CONTOUR_SILERO_SPEAKER) { $env:CONTOUR_SILERO_SPEAKER = 'eugene' }
if ($QwenSpeech) { $env:CONTOUR_PIPER_VOICE = '' }
if (!$env:CONTOUR_PIPER_FALLBACK) {
    $env:CONTOUR_PIPER_FALLBACK = Join-Path $AiRoot 'models\piper\ru_RU-dmitri-medium.onnx'
}
if (-not $env:QWEN_TTS_TMOD) {
    $env:QWEN_TTS_TMOD = Join-Path $env:QWEN_TTS_DIR 'contour.q8.tmod'
}
if ($Vulkan) {
    $env:QWEN_TTS_DEVICE = 'vulkan:0'
    $env:OLLAMA_VULKAN = '1'
    $env:OLLAMA_LLM_LIBRARY = 'vulkan'
    if (!$env:OLLAMA_KEEP_ALIVE) { $env:OLLAMA_KEEP_ALIVE = '20m' }
}
$worker = Join-Path $PSScriptRoot 'qwen_voice.py'

function Start-LocalService($port, $program, $arguments, $logName) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { return }
    Start-Process -FilePath $program -ArgumentList $arguments -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $AiRoot "$logName.log") `
        -RedirectStandardError (Join-Path $AiRoot "$logName-error.log")
}

$ollama = Join-Path $AiRoot 'ollama\ollama.exe'
if (Test-Path -LiteralPath $ollama) { Start-LocalService 11434 $ollama 'serve' 'ollama' }
Start-LocalService $AsrPort (Join-Path $AiRoot 'qwen-voice\Scripts\python.exe') "-u `"$worker`" transcribe --port $AsrPort" 'qwen-asr'
Start-LocalService $TtsPort (Join-Path $AiRoot 'qwen-tts\Scripts\python.exe') "-u `"$worker`" speak --port $TtsPort" 'qwen-tts'
