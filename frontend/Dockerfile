# Production image: build the static site, serve it with unprivileged nginx.

# --- stage 1: build ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vite bakes this into the JavaScript at build time.
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build
# The same address goes into the Content-Security-Policy (connect-src), so the
# page may talk to our API and nowhere else. Done at BUILD time: the running
# container then needs no writable config and no environment variables.
RUN sed "s|\${API_ORIGIN}|${VITE_API_URL}|g" nginx/default.conf.template > default.conf

# --- stage 2: serve ---
# nginx-unprivileged runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /app/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO /dev/null http://127.0.0.1:8080/ || exit 1
