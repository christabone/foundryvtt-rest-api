#!/bin/bash
# Deployment script for FoundryVTT Local Relay Server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="${1:-docker-compose.yml}"
ENV_FILE="${2:-.env}"
SERVICE_NAME="foundry-relay"

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

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    if [ ! -f "$COMPOSE_FILE" ]; then
        log_error "Docker Compose file not found: $COMPOSE_FILE"
        exit 1
    fi
    
    if [ ! -f "$ENV_FILE" ]; then
        log_warn "Environment file not found: $ENV_FILE"
        log_info "Creating from example..."
        cp "${ENV_FILE}.example" "$ENV_FILE" 2>/dev/null || {
            log_error "Could not create environment file"
            exit 1
        }
    fi
    
    log_success "Prerequisites check passed"
}

# Deploy the application
deploy() {
    log_info "Starting deployment..."
    log_info "Compose file: $COMPOSE_FILE"
    log_info "Environment file: $ENV_FILE"
    
    # Pull latest images
    log_info "Pulling latest images..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull
    
    # Start services
    log_info "Starting services..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 10
    
    # Check health
    if docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T "$SERVICE_NAME" curl -f http://localhost:3001/health &> /dev/null; then
        log_success "Service is healthy and ready"
    else
        log_warn "Service health check failed - checking logs..."
        docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs "$SERVICE_NAME"
    fi
    
    log_success "Deployment completed!"
}

# Show status
show_status() {
    log_info "Service status:"
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
    
    log_info "Recent logs:"
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail=20 "$SERVICE_NAME"
}

# Stop services
stop() {
    log_info "Stopping services..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
    log_success "Services stopped"
}

# Main execution
case "${3:-deploy}" in
    "deploy")
        check_prerequisites
        deploy
        show_status
        ;;
    "status")
        show_status
        ;;
    "stop")
        stop
        ;;
    "restart")
        stop
        check_prerequisites
        deploy
        show_status
        ;;
    *)
        echo "Usage: $0 [compose-file] [env-file] [deploy|status|stop|restart]"
        echo "  compose-file: Docker Compose file (default: docker-compose.yml)"
        echo "  env-file: Environment file (default: .env)"
        echo "  action: deploy (default), status, stop, or restart"
        exit 1
        ;;
esac