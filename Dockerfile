FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV VITE_LIVE_API=/api/patch
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080 SIMA_CACHE=/cache HOME=/home/sima \
    OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
WORKDIR /app
COPY scripts/requirements.txt scripts/places_requirements.txt ./scripts/
RUN pip install --no-cache-dir -r scripts/requirements.txt \
    && groupadd --gid 10001 sima \
    && useradd --uid 10001 --gid 10001 --create-home sima \
    && mkdir /cache && chown sima:sima /cache
COPY scripts/ ./scripts/
COPY --from=frontend /app/dist ./dist
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8080')+'/api/health',timeout=4).read()"
CMD ["python", "scripts/serve.py"]
