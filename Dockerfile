FROM node:20-bookworm
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation fonts-noto-color-emoji && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["npm","start"]