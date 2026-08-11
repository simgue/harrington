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
COPY --from=build /app/src ./src

ENV HARRINGTON_HOST=0.0.0.0
ENV HARRINGTON_PORT=4173
ENV HARRINGTON_DATA_DIR=/data

EXPOSE 4173
VOLUME ["/data"]

CMD ["node", "server.mjs"]
