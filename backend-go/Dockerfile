# syntax=docker/dockerfile:1

# The Go proxy default matches the rest of this project's China-reachable
# mirrors; proxy.golang.org is not reachable from the build host.
ARG GO_VERSION=1.26
ARG GOPROXY=https://goproxy.cn,direct

FROM golang:${GO_VERSION}-alpine AS build
ARG GOPROXY
ENV GOPROXY=${GOPROXY} CGO_ENABLED=0

WORKDIR /src

# Dependencies are copied first so a source-only change does not re-download
# the module graph.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -trimpath -ldflags="-s -w" -o /out/arkive ./cmd/arkive

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -u 10001 arkive
COPY --from=build /out/arkive /usr/local/bin/arkive

USER arkive
EXPOSE 9000
ENTRYPOINT ["/usr/local/bin/arkive"]
