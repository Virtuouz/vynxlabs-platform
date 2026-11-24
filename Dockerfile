# One image for every deployment mode. Differences between modes are configuration.
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .pnpmfile.cjs ./
COPY apps/control-plane/package.json apps/control-plane/
COPY apps/console/package.json apps/console/
COPY packages/app/package.json packages/app/
COPY packages/cli/package.json packages/cli/
COPY packages/compose/package.json packages/compose/
COPY packages/db/package.json packages/db/
COPY packages/docs/package.json packages/docs/
COPY packages/docs-engine/package.json packages/docs-engine/
COPY packages/docs-site/package.json packages/docs-site/
COPY packages/manifest/package.json packages/manifest/
COPY packages/markup/package.json packages/markup/
COPY packages/nodes/package.json packages/nodes/
COPY packages/screens/package.json packages/screens/
COPY packages/sdk/package.json packages/sdk/
COPY packages/ui/package.json packages/ui/
COPY packages/widget-sdk/package.json packages/widget-sdk/
COPY packages/widgets-core/package.json packages/widgets-core/
COPY packages/widgets-labs/package.json packages/widgets-labs/
COPY packages/worker/package.json packages/worker/
COPY examples/acme/package.json examples/acme/
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.base.json ./
# The documentation's "What's new" is made from it (packages/docs/generators/changelog.mjs).
COPY CHANGELOG.md ./
COPY apps apps
COPY packages packages
# Compiles the services and builds the console's static files, and the app that draws interfaces.
RUN pnpm build
# A self-contained copy of the control plane with production dependencies only.
# It includes the worker, which the control plane starts for tenants that have work.
RUN pnpm --filter @volvel/control-plane deploy --prod /out

FROM node:24-slim
# Managed workers run as vxrun, a user of their own, so a tenant's script can neither read
# the control plane's environment nor signal it. Switching users needs CAP_SETUID and
# CAP_SETGID. Only node-cp, the copy of node the control plane runs on, holds them: a
# worker and its scripts run on plain node and hold none, so they cannot switch back.
# Without those capabilities in the container, node-cp cannot start at all, and
# volvel-start runs the control plane on plain node instead: it then refuses managed
# workers to tenants whose code is written outside the operator. See /docs/self-host/explanation/running/managed-workers-and-isolation on an instance.
#
# The same image runs the worker host (volvel-worker-host), which starts managed workers
# in a container of its own; iptables lets it keep them from private addresses.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libcap2-bin iptables \
  && cp /usr/local/bin/node /usr/local/bin/node-cp \
  && setcap cap_setuid,cap_setgid+ep /usr/local/bin/node-cp \
  && apt-get purge -y libcap2-bin \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 10001 vxrun \
  && useradd --system --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin vxrun
ENV NODE_ENV=production
ENV CONSOLE_DIR=/app/console
ENV SCREENS_DIR=/app/screens
WORKDIR /app
COPY --from=build /out .
COPY --from=build /repo/apps/console/dist ./console
COPY --from=build /repo/packages/screens/runtime/dist ./screens
USER node
EXPOSE 8080
COPY --chmod=755 deploy/image/volvel-start /usr/local/bin/volvel-start
COPY --chmod=755 deploy/image/volvel-worker-host /usr/local/bin/volvel-worker-host
CMD ["volvel-start", "dist/main.js"]
