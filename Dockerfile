FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.4 --activate
# Binaire Typst (compilation des PDF), version épinglée et somme vérifiée par le
# script ; curl et xz ne servent qu'ici, l'image finale ne les embarque pas.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
 && rm -rf /var/lib/apt/lists/*
COPY scripts/install-typst.sh scripts/
RUN scripts/install-typst.sh /usr/local/bin
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/evaluations.sqlite
# Police Lato des PDF (OFL) ; typst retombe sur DejaVu Sans (assets/fonts) sinon.
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-lato \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/local/bin/typst /usr/local/bin/typst
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/assets ./assets
COPY --from=build --chown=node:node /app/typst ./typst
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "server/index.ts"]
