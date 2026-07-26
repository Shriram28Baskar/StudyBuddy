FROM python:3.11-slim

WORKDIR /app

# Install minimal OS dependencies needed for python packages
# Note: Manim OS dependencies (ffmpeg, texlive, cairo) are intentionally omitted
# to keep the image lean, optimizing for the core product experience.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose API port
EXPOSE 8000

# Start FastAPI application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
