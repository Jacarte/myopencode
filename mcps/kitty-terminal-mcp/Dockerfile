FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends kitty \
  && rm -rf /var/lib/apt/lists/*

COPY package.json /app/package.json
COPY server.mjs /app/server.mjs

RUN npm install --omit=dev

CMD ["node", "/app/server.mjs"]
