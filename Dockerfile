# The frontend remains an independent npm workspace. Its output is embedded
# in the patched Forgejo binary by the Go overlay during this source build.
FROM golang:1.26.7-alpine3.23@sha256:b17af760035fc2f338eed92d448a6c67f2d45438844fc6c60678fa5f99e44b57 AS build
RUN apk add --no-cache build-base git nodejs npm
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --no-audit --no-fund
COPY apps apps
COPY integration integration
COPY scripts scripts
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/root/.npm \
    npm run build

FROM codeberg.org/forgejo/forgejo:16.0.5@sha256:cf5f5ae6acf2ababca0ee3d255705b83a47f35b25e07fc931d694d60664053fe
COPY --from=build /workspace/.forgejo/bin/forgejo /usr/local/bin/gitea
LABEL org.opencontainers.image.title="Forgejo with an independent SPA" \
      org.opencontainers.image.licenses="GPL-3.0-or-later"
