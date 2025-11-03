FROM node:lts-alpine3.19 AS pruner
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY . .

FROM node:lts-alpine3.19 AS builder
RUN apk update
RUN apk add --no-cache libc6-compat curl
WORKDIR /app
COPY --from=pruner /app/package-lock.json ./package-lock.json
COPY --from=pruner /app/ .
RUN npm ci
ENV NODE_ENV=production
RUN npm run build

FROM node:lts-alpine3.19 AS runner

WORKDIR /app

# Security and permissions
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 web
USER web

# TODO: We are copying everything over, we probably don't need it all.
COPY --from=builder --chown=web:nodejs /app/ .

# Expose the port your web server runs on, assuming it's 5173
EXPOSE 3001

WORKDIR /app/apps/web
CMD ["npm", "run", "start"]
