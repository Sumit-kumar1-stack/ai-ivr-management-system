FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npx prisma generate && npm run build

FROM base AS runtime
RUN groupadd --system ivr && useradd --system --gid ivr --create-home ivr
COPY --from=build --chown=ivr:ivr /app/package.json /app/package-lock.json ./
COPY --from=build --chown=ivr:ivr /app/node_modules ./node_modules
COPY --from=build --chown=ivr:ivr /app/.next ./.next
COPY --from=build --chown=ivr:ivr /app/prisma ./prisma
COPY --from=build --chown=ivr:ivr /app/src ./src
COPY --from=build --chown=ivr:ivr /app/tsconfig.json ./
USER ivr
CMD ["npm", "run", "start:web"]
