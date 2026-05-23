# PATHMAP Backend Dockerfile - V98 Production Optimized
FROM python:3.14-slim AS base

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies for osmnx and geospatial libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libgeos-dev \
    libproj-dev \
    libspatialindex-dev \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create non-root user for security
RUN groupadd --gid 1000 pathmap \
    && useradd --uid 1000 --gid pathmap --shell /bin/bash --create-home pathmap

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies including gunicorn for production
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY --chown=pathmap:pathmap . .

# Create data and cache directories
RUN mkdir -p /app/data /app/cache/tiles \
    && chown -R pathmap:pathmap /app

# Switch to non-root user
USER pathmap

# Expose port 8000
EXPOSE 8000

# Health check using curl (more reliable than python import)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# V98: Production command with gunicorn + uvicorn workers
# - Workers: 2-4 per CPU core (auto-calculated)
# - Timeout: 120s for long pathfinding calculations
# - Keep-alive: 5s for connection reuse
CMD ["gunicorn", "main:app", \
    "-k", "uvicorn.workers.UvicornWorker", \
    "-w", "2", \
    "-b", "0.0.0.0:8000", \
    "--timeout", "120", \
    "--keep-alive", "5", \
    "--access-logfile", "-", \
    "--error-logfile", "-", \
    "--capture-output"]
