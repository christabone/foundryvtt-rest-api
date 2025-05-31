# FoundryVTT Local Relay Server Dockerfile
# Multi-stage build for optimized production image

# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build the server
RUN npm run server:build

# Production stage
FROM node:18-alpine AS production

# Install curl for health checks and security updates
RUN apk add --no-cache curl \
    && apk upgrade --no-cache

# Add security: Create non-root user with minimal privileges
RUN addgroup -g 1001 -S nodejs && \
    adduser -S foundry -u 1001 -G nodejs -h /app -s /bin/sh

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
COPY yarn.lock ./
RUN npm ci --only=production && npm cache clean --force

# Copy built server from builder stage
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/src ./server/src

# Create data directory for persistent storage with proper permissions
RUN mkdir -p /app/server/data && \
    chown -R foundry:nodejs /app/server/data && \
    chmod 750 /app/server/data

# Create logs directory with proper permissions
RUN mkdir -p /app/logs && \
    chown -R foundry:nodejs /app/logs && \
    chmod 750 /app/logs

# Set proper ownership for the entire app directory
RUN chown -R foundry:nodejs /app && \
    chmod 755 /app

# Switch to non-root user (security best practice)
USER foundry

# Expose port
EXPOSE 3001

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Environment variables with defaults
ENV NODE_ENV=production
ENV PORT=3001
ENV LOG_LEVEL=info

# Start the server
CMD ["node", "server/dist/server.js"]