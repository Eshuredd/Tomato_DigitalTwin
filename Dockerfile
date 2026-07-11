FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

ENV CROPTWIN_API_BASE_URL=http://127.0.0.1:8000
ENV CROPTWIN_DISEASE_ARTIFACT_DIR=/workspace/backend/model_artifacts/croptwin_disease

WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        libgomp1 \
        supervisor \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /tmp/backend-requirements.txt
COPY frontend/requirements.txt /tmp/frontend-requirements.txt

RUN python -m pip install --upgrade pip \
    && python -m pip install \
        -r /tmp/backend-requirements.txt \
        -r /tmp/frontend-requirements.txt

COPY backend/ /workspace/backend/
COPY frontend/ /workspace/frontend/
COPY .streamlit/ /workspace/.streamlit/
COPY docker/supervisord.conf /etc/supervisor/conf.d/croptwin.conf

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD curl --fail http://127.0.0.1:7860/_stcore/health || exit 1

CMD ["supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]