FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY scripts ./scripts
COPY src ./src
COPY web ./web
COPY default-assets ./default-assets

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3210
ENV HOST=0.0.0.0
ENV DATA_ROOT=/app/data
ENV PODCAST_FFMPEG_PATH=/usr/bin/ffmpeg

EXPOSE 3210

CMD ["npm", "run", "start:web"]
