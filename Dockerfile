# One image for every deployment mode. Differences between modes are configuration.
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .pnpmfile.cjs ./
COPY apps/control-plane/package.json apps/control-plane/
COPY apps/console/package.json apps/console/
COPY packages/app/package.json packages/app/
COPY packages/cli/package.json packages/cli/
COPY packages/db/package.json packages/db/
COPY packages/manifest/package.json packages/manifest/
COPY packages/sdk/package.json packages/sdk/
COPY packages/ui/package.json packages/ui/
COPY packages/worker/package.json packages/worker/
COPY examples/acme/package.json examples/acme/
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.base.json ./
COPY apps apps
COPY packages packages
# Compiles the services and builds the console's static files.
RUN pnpm build
# A self-contained copy of the control plane with production dependencies only.
# It includes the worker, which the control plane starts for tenants that have work.
RUN pnpm --filter @vynxlabs/control-plane deploy --prod /out

FROM node:24-slim
ENV NODE_ENV=production
ENV CONSOLE_DIR=/app/console
WORKDIR /app
COPY --from=build /out .
COPY --from=build /repo/apps/console/dist ./console
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
