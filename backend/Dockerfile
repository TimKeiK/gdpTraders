FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npx tsc

# Production image
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV USE_IN_MEMORY_DB=false

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built output
COPY --from=builder /app/dist ./dist

# Copy schema for initialization
COPY src/db/schema.sql ./src/db/schema.sql

EXPOSE 8000

CMD ["node", "dist/index.js"]