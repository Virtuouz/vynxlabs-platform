# One image for every deployment mode. Differences between modes are configuration.
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .pnpmfile.cjs ./
COPY apps/control-plane/package.json apps/control-plane/
COPY packages/db/package.json packages/db/
COPY packages/manifest/package.json packages/manifest/
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.base.json ./
COPY apps apps
COPY packages packages
RUN pnpm build
# A self-contained copy of the control plane with production dependencies only.
RUN pnpm --filter @vynxlabs/control-plane deploy --prod /out

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
