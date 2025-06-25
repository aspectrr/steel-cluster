# Dockerfile for the orchestrator
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S orchestrator -u 1001

# Change ownership
RUN chown -R orchestrator:nodejs /app
USER orchestrator

EXPOSE 3000

CMD ["node", "server.js"]
