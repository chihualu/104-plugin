# Dockerfile for Go Scheduler
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build
RUN go build -o scheduler .

# Final stage
FROM alpine:latest

WORKDIR /app

# Install necessary runtime dependencies (if any)
# RUN apk add --no-cache ca-certificates

# Copy binary from builder
COPY --from=builder /app/scheduler .

# Run
CMD ["./scheduler"]
