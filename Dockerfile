FROM node:20-alpine AS deps
WORKDIR /app
# better-sqlite3 is a native module — alpine has no prebuilt musl binary, so it
# compiles from source and needs python3/make/g++.
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# sqlite3 native bindings need python/make at runtime
RUN apk add --no-cache libc6-compat

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Persist the SQLite data directory as a volume
VOLUME ["/app/data"]

EXPOSE 3003
ENV PORT=3003

CMD ["node", "server.js"]
