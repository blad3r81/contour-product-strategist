param(
    [Parameter(Mandatory=$true)][string]$AiRoot,
    [string]$PythonPath = 'python',
    [switch]$ModelsOnly,
    [switch]$AcceptSileroLicense
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (!$AcceptSileroLicense) {
    throw 'Сначала ознакомьтесь с лицензией Silero: https://github.com/snakers4/silero-models/blob/master/LICENSE . Для установки выбранного некоммерческого профиля добавьте -AcceptSileroLicense. Для коммерческого использования разрешение нужно проверить отдельно.'
}
New-Item -ItemType Directory -Force -Path $AiRoot | Out-Null
$AiRoot = (Resolve-Path -LiteralPath $AiRoot).Path
$models = Join-Path $AiRoot 'models'
$downloads = Join-Path $AiRoot 'downloads'
New-Item -ItemType Directory -Force -Path $models,$downloads | Out-Null

function Run-Checked($program, $arguments) {
    & $program @arguments
    if ($LASTEXITCODE -ne 0) { throw "Не завершена установка: $program" }
}
if (!$ModelsOnly) {
    Run-Checked $PythonPath @('-c', 'import sys; assert sys.version_info[:2] == (3,11), "Use Python 3.11"')
    foreach ($name in @('qwen-voice','qwen-tts')) {
        $venv = Join-Path $AiRoot $name
        if (!(Test-Path -LiteralPath (Join-Path $venv 'Scripts/python.exe'))) { Run-Checked $PythonPath @('-m','venv',$venv) }
    }
    $asr = Join-Path $AiRoot 'qwen-voice/Scripts/python.exe'
    $tts = Join-Path $AiRoot 'qwen-tts/Scripts/python.exe'
    Run-Checked $asr @('-m','pip','install','-r',(Join-Path $PSScriptRoot 'requirements-asr.txt'))
    Run-Checked $tts @('-m','pip','install','torch==2.15.0','--index-url','https://download.pytorch.org/whl/cpu')
    Run-Checked $tts @('-m','pip','install','-r',(Join-Path $PSScriptRoot 'requirements-tts.txt'))
}

function Download-Model($url, $output, [long]$size = 0) {
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        Run-Checked 'curl.exe' @('--fail','--location','--retry','2','--connect-timeout','30','--max-time','900','--silent','--show-error','--output',$output,$url)
    } else { Invoke-WebRequest $url -OutFile $output -TimeoutSec 900 -UseBasicParsing }
}
$manifest = Get-Content -LiteralPath (Join-Path $repo 'agent/jury-runtime.json') -Raw | ConvertFrom-Json
function Matches-Reference($entry) {
    $file = Join-Path $models $entry.path
    return (Test-Path -LiteralPath $file) -and ((Get-Item -LiteralPath $file).Length -eq $entry.bytes) -and ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -eq $entry.sha256)
}
$zipFiles = @($manifest.files | Where-Object component -eq 'conversation-asr')
if (@($zipFiles | Where-Object { !(Matches-Reference $_) }).Count -gt 0) {
    $archive = Join-Path $downloads 'zipformer-ru-int8-2025-04-20.tar.bz2'
    Download-Model 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-zipformer-ru-int8-2025-04-20.tar.bz2' $archive
    $sherpa = Join-Path $models 'sherpa'
    New-Item -ItemType Directory -Force -Path $sherpa | Out-Null
    Run-Checked 'tar' @('-xf',$archive,'-C',$sherpa)
}
$urls = @{
    'dictation-asr'='https://huggingface.co/handy-computer/Qwen3-ASR-0.6B-gguf/resolve/main/Qwen3-ASR-0.6B-Q8_0.gguf'
    'tts'='https://models.silero.ai/models/tts/ru/v5_6_ru.pt'
}
foreach ($entry in $manifest.files) {
    $file = Join-Path $models $entry.path
    foreach ($candidate in @("$file.part", "$file.part.segment")) {
        if ((Test-Path -LiteralPath $candidate) -and ((Get-Item -LiteralPath $candidate).Length -eq $entry.bytes) -and ((Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant() -eq $entry.sha256)) {
            Move-Item -LiteralPath $candidate -Destination $file -Force
        }
    }
    if (!(Matches-Reference $entry) -and $urls.ContainsKey($entry.component)) {
        $file = Join-Path $models $entry.path
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $file) | Out-Null
        Download-Model $urls[$entry.component] "$file.part" $entry.bytes
        if ((Get-FileHash -LiteralPath "$file.part" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Контрольная сумма не совпала: $($entry.path). Файл не включён в рабочий профиль." }
        Move-Item -LiteralPath "$file.part" -Destination $file -Force
    }
    if (!(Matches-Reference $entry)) { throw "Модель не прошла проверку: $($entry.path)" }
}
Write-Output "Речевой профиль подготовлен в $AiRoot. Запуск: powershell -NoProfile -ExecutionPolicy Bypass -File voice/start.ps1 -AiRoot `"$AiRoot`""
