# PATHMAP Frontend Dockerfile - V98 Production Optimized
# Multi-stage build for minimal production image

# ============================================
# Stage 1: Build
# ============================================
FROM node:26-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy application code
COPY . .

# Build production assets
RUN npm run build

# ============================================
# Stage 2: Production
# ============================================
FROM nginx:alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Copy custom nginx config for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Create non-root user for security
RUN addgroup -g 1000 pathmap \
    && adduser -u 1000 -G pathmap -s /bin/sh -D pathmap \
    && chown -R pathmap:pathmap /usr/share/nginx/html \
    && chown -R pathmap:pathmap /var/cache/nginx \
    && chown -R pathmap:pathmap /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown -R pathmap:pathmap /var/run/nginx.pid

# Expose port 80 (nginx default)
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:80/ || exit 1

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]

# ============================================
# Stage 3: Development (optional, use --target=development)
# ============================================
FROM node:26-alpine AS development

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Expose dev port
EXPOSE 3002

# Health check for dev server
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3002 || exit 1

# Run development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
