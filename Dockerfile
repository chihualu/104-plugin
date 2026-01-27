# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies and set timezone
RUN apk add --no-cache tzdata
ENV TZ=Asia/Taipei

# Install dependencies
COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci

# Copy source
COPY . .

# Generate Prisma Client & Build Frontend
RUN npx prisma generate
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Set timezone
RUN apk add --no-cache tzdata
ENV TZ=Asia/Taipei

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy built assets and server code from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Install tsx for running server
RUN npm install -g tsx

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "run", "start"]
