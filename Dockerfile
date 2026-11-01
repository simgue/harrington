FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY tailwind.config.cjs ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build

FROM node:22-alpine

WORKDIR /app
COPY server.mjs ./
COPY lib ./lib
COPY --from=build /app/src ./src

ENV HARRINGTON_HOST=0.0.0.0
ENV HARRINGTON_PORT=4173
ENV HARRINGTON_DATA_DIR=/data

# Run as the image's unprivileged node user (uid 1000), not root. /data is
# created owned by it, so a new named volume starts writable. A volume or bind
# mount first used by an older, root-run image keeps root-owned files: change
# them once on the host with chown -R 1000:1000 (docs/DEPLOYMENT.md).
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 4173
VOLUME ["/data"]

CMD ["node", "server.mjs"]
