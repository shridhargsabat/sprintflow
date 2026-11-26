# syntax: docker/dockerfile:1
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
ARG BUILD_SHA=local
ENV BUILD_SHA=$BUILD_SHA
WORKDIR /app
COPY package.json package-lock.json ./
RUN for i in 1 2 3; do \
      npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 \
      && exit 0; \
      echo "npm ci attempt $i failed (network flake?)"; \
      [ "$i" -lt 3 ] && sleep 10; \
    done; \
    echo "npm ci failed after 3 attempts" >&2; exit 1
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
