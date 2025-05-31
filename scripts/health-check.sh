#!/bin/sh
# Health check script for FoundryVTT Local Relay Server

# Configuration
HEALTH_URL="${HEALTH_URL:-http://localhost:3001/health}"
TIMEOUT="${HEALTH_TIMEOUT:-5}"
MAX_RETRIES="${HEALTH_MAX_RETRIES:-3}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] $1"
}

log_warn() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [WARN] $1" >&2
}

log_error() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] $1" >&2
}

# Perform health check
perform_health_check() {
    local attempt=1
    
    while [ $attempt -le $MAX_RETRIES ]; do
        log_info "Health check attempt $attempt/$MAX_RETRIES"
        
        # Perform the health check
        response=$(curl -f -s -m $TIMEOUT "$HEALTH_URL" 2>/dev/null)
        curl_exit_code=$?
        
        if [ $curl_exit_code -eq 0 ]; then
            # Parse JSON response to check status
            status=$(echo "$response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
            
            if [ "$status" = "ok" ]; then
                log_info "${GREEN}Health check passed - Server is healthy${NC}"
                
                # Extract additional info
                timestamp=$(echo "$response" | grep -o '"timestamp":"[^"]*"' | cut -d'"' -f4)
                websocket=$(echo "$response" | grep -o '"websocket":"[^"]*"' | cut -d'"' -f4)
                
                log_info "Server status: $status"
                log_info "Last update: $timestamp"
                log_info "WebSocket: $websocket"
                
                return 0
            else
                log_warn "${YELLOW}Health check returned non-ok status: $status${NC}"
            fi
        else
            case $curl_exit_code in
                7)  log_error "Connection refused - Server may not be running" ;;
                28) log_error "Connection timeout - Server may be overloaded" ;;
                *)  log_error "Health check failed with curl exit code: $curl_exit_code" ;;
            esac
        fi
        
        if [ $attempt -lt $MAX_RETRIES ]; then
            log_info "Retrying in 2 seconds..."
            sleep 2
        fi
        
        attempt=$((attempt + 1))
    done
    
    log_error "${RED}Health check failed after $MAX_RETRIES attempts${NC}"
    return 1
}

# Main execution
main() {
    log_info "Starting health check for FoundryVTT Local Relay Server"
    log_info "Health URL: $HEALTH_URL"
    log_info "Timeout: ${TIMEOUT}s, Max retries: $MAX_RETRIES"
    
    perform_health_check
    exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        log_info "Health check completed successfully"
    else
        log_error "Health check failed"
    fi
    
    exit $exit_code
}

# Run main function
main "$@"