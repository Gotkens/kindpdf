# frontend/Dockerfile
# KindPDF — React frontend container
#
# Stage 1 (builder): Node 20 installs dependencies and compiles the React app.
# Stage 2 (server):  nginx serves the compiled build folder on port 80.
#
# All API calls in the React source use relative paths (/api/...).
# nginx proxies them to the Flask backend container — see nginx.conf.

# ── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first — Docker caches this layer so npm install only
# reruns when package.json or package-lock.json actually changes.
COPY package.json package-lock.json* ./

RUN npm ci --silent

# Copy the rest of the source and build.
# DISABLE_ESLINT_PLUGIN=true skips lint errors that would abort the build.
COPY . .
RUN DISABLE_ESLINT_PLUGIN=true npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Remove the default nginx welcome page.
RUN rm -rf /usr/share/nginx/html/*

# Copy the compiled React app into nginx's web root.
COPY --from=builder /app/build /usr/share/nginx/html

# Copy the nginx config.
# This sets up the /api/ proxy to the backend and the 50 MB upload limit.
# See frontend/nginx.conf for full documentation.
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
