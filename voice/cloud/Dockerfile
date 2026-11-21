FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2
RUN apt-get update && apt-get install -y --no-install-recommends libsndfile1 libgomp1 ca-certificates ffmpeg && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir torch==2.15.0 --index-url https://download.pytorch.org/whl/cpu && pip install --no-cache-dir -r requirements.txt
COPY download.py jury-runtime.json ./
RUN python download.py
COPY qwen_voice.py app.py ./
ENV CONTOUR_ZIPFORMER_MODEL=/models/sherpa/sherpa-onnx-zipformer-ru-int8-2025-04-20 QWEN_ASR_DIR=/models/qwen-asr CONTOUR_SILERO_MODEL=/models/silero/v5_6_ru.pt CONTOUR_SILERO_SPEAKER=eugene
EXPOSE 7860
CMD ["python", "app.py"]
