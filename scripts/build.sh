#!/bin/bash
# Build script for FoundryVTT Local Relay Server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="foundry-relay-server"
TAG="${1:-latest}"
DOCKERFILE="${2:-Dockerfile}"
CONTEXT="${3:-.}"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed or not in PATH"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    log_error "Docker daemon is not running"
    exit 1
fi

log_info "Building Docker image: $IMAGE_NAME:$TAG"
log_info "Dockerfile: $DOCKERFILE"
log_info "Context: $CONTEXT"

# Build the Docker image
log_info "Starting Docker build..."
if docker build -t "$IMAGE_NAME:$TAG" -f "$DOCKERFILE" "$CONTEXT"; then
    log_success "Docker image built successfully: $IMAGE_NAME:$TAG"
else
    log_error "Docker build failed"
    exit 1
fi

# Get image size
IMAGE_SIZE=$(docker images "$IMAGE_NAME:$TAG" --format "table {{.Size}}" | tail -n 1)
log_info "Image size: $IMAGE_SIZE"

# Optional: Run quick test
if [ "$4" = "--test" ]; then
    log_info "Running quick test of the built image..."
    
    # Start container in background
    CONTAINER_ID=$(docker run -d -p 3001:3001 "$IMAGE_NAME:$TAG")
    
    # Wait for server to start
    sleep 5
    
    # Test health endpoint
    if curl -f http://localhost:3001/health &> /dev/null; then
        log_success "Health check passed"
    else
        log_warn "Health check failed - server may not be ready"
    fi
    
    # Clean up
    docker stop "$CONTAINER_ID" &> /dev/null
    docker rm "$CONTAINER_ID" &> /dev/null
    log_info "Test container cleaned up"
fi

log_success "Build completed successfully!"
log_info "To run the container: docker run -p 3001:3001 $IMAGE_NAME:$TAG"