FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1

# Install Python runtime + pip + CJK fonts, then install Pillow at build time.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    fonts-noto-cjk \
    ca-certificates \
  && python3 -m pip install --no-cache-dir --break-system-packages Pillow \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

CMD ["node", "bot.js"]
