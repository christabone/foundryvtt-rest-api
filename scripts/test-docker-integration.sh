#!/bin/bash
# Docker Integration Test Script for FoundryVTT Local Relay Server
# Tests the Docker containerized version

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Configuration
DOCKER_PORT=3003
TEST_API_KEY="fvtt_52f2e605b825d6dd64c10d1b006b713abd78843d7dbb23f2c8bc596664e9ab31"

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

log_section() {
    echo -e "${PURPLE}[SECTION]${NC} $1"
}

# Test function
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="$3"
    local method="${4:-GET}"
    local data="${5:-}"
    local headers="${6:-}"
    
    local curl_cmd="curl -s -w '%{http_code}' -o /dev/null"
    
    if [ "$method" = "POST" ]; then
        curl_cmd="$curl_cmd -X POST"
    fi
    
    if [ -n "$data" ]; then
        curl_cmd="$curl_cmd -d '$data' -H 'Content-Type: application/json'"
    fi
    
    if [ -n "$headers" ]; then
        curl_cmd="$curl_cmd -H '$headers'"
    fi
    
    curl_cmd="$curl_cmd $url"
    
    local status=$(eval $curl_cmd 2>/dev/null)
    
    if [ "$status" = "$expected_status" ]; then
        log_success "$name (HTTP $status)"
        return 0
    else
        log_error "$name (Expected: $expected_status, Got: $status)"
        return 1
    fi
}

main() {
    echo -e "${PURPLE}========================================${NC}"
    echo -e "${PURPLE}Docker Integration Validation${NC}"
    echo -e "${PURPLE}FoundryVTT Local Relay Server${NC}"
    echo -e "${PURPLE}========================================${NC}"
    
    local base_url="http://localhost:$DOCKER_PORT"
    local failed=0
    
    # Check if container is running
    if ! docker ps | grep foundry-relay-server > /dev/null; then
        log_error "Docker container 'foundry-relay-server' is not running"
        echo "Start with: docker-compose up -d"
        exit 1
    fi
    
    log_success "Docker container is running"
    
    # Wait for container to be ready
    log_info "Waiting for container to be fully ready..."
    local retries=10
    while [ $retries -gt 0 ]; do
        if curl -s "$base_url/health" > /dev/null 2>&1; then
            break
        fi
        sleep 2
        ((retries--))
    done
    
    if [ $retries -eq 0 ]; then
        log_error "Container failed to become ready"
        exit 1
    fi
    
    log_success "Container is ready and responding"
    
    # Test 1: Basic Health Checks
    log_section "1. Testing Basic Health Endpoints"
    test_endpoint "Health Check" "$base_url/health" "200" || ((failed++))
    test_endpoint "API Documentation" "$base_url/api/docs" "200" || ((failed++))
    test_endpoint "Status Endpoint" "$base_url/api/status" "503" || ((failed++))
    
    # Test 2: Authentication
    log_section "2. Testing Authentication"
    test_endpoint "Auth Required" "$base_url/api/search" "401" "POST" '{"query":"test"}' || ((failed++))
    test_endpoint "Invalid API Key" "$base_url/api/search" "401" "POST" '{"query":"test"}' "x-api-key: invalid" || ((failed++))
    test_endpoint "Valid API Key" "$base_url/api/search" "503" "POST" '{"query":"test"}' "x-api-key: $TEST_API_KEY" || ((failed++))
    
    # Test 3: API Endpoints Exist
    log_section "3. Testing API Endpoint Availability"
    test_endpoint "Entity Endpoint" "$base_url/api/entity/test" "503" "GET" "" "x-api-key: $TEST_API_KEY" || ((failed++))
    test_endpoint "Roll Endpoint" "$base_url/api/roll" "503" "POST" '{"formula":"1d20"}' "x-api-key: $TEST_API_KEY" || ((failed++))
    test_endpoint "Structure Endpoint" "$base_url/api/structure" "503" "GET" "" "x-api-key: $TEST_API_KEY" || ((failed++))
    
    # Test 4: Error Handling
    log_section "4. Testing Error Handling"
    test_endpoint "Non-existent API Endpoint" "$base_url/api/nonexistent" "503" "GET" "" "x-api-key: $TEST_API_KEY" || ((failed++))
    test_endpoint "Wrong Method" "$base_url/api/search" "503" "GET" "" "x-api-key: $TEST_API_KEY" || ((failed++))
    test_endpoint "Non-API Path" "$base_url/nonexistent" "404" "GET" || ((failed++))
    
    # Test 5: Container Health
    log_section "5. Testing Container Health"
    local health_status=$(docker inspect foundry-relay-server --format='{{.State.Health.Status}}' 2>/dev/null || echo "none")
    if [ "$health_status" = "healthy" ]; then
        log_success "Container health check: $health_status"
    else
        log_warn "Container health check: $health_status"
        ((failed++))
    fi
    
    # Test 6: Resource Usage
    log_section "6. Testing Resource Usage"
    local mem_usage=$(docker stats foundry-relay-server --no-stream --format "{{.MemUsage}}" | cut -d'/' -f1 | sed 's/[^0-9.]*//g')
    local cpu_usage=$(docker stats foundry-relay-server --no-stream --format "{{.CPUPerc}}" | sed 's/%//')
    
    log_info "Memory usage: ${mem_usage}MB"
    log_info "CPU usage: ${cpu_usage}%"
    
    # Memory should be under 100MB for basic operation
    if (( $(echo "$mem_usage < 100" | bc -l) )); then
        log_success "Memory usage is acceptable (< 100MB)"
    else
        log_warn "Memory usage is high (> 100MB)"
    fi
    
    # Test 7: Volume Persistence
    log_section "7. Testing Volume Persistence"
    if docker exec foundry-relay-server test -f /app/server/data/api-keys.json; then
        log_success "API keys file persisted in volume"
    else
        log_error "API keys file not found in volume"
        ((failed++))
    fi
    
    # Test 8: Logs
    log_section "8. Testing Container Logs"
    local log_lines=$(docker logs foundry-relay-server 2>&1 | wc -l)
    if [ $log_lines -gt 0 ]; then
        log_success "Container is generating logs ($log_lines lines)"
    else
        log_error "Container is not generating logs"
        ((failed++))
    fi
    
    echo ""
    echo -e "${PURPLE}========================================${NC}"
    echo -e "${PURPLE}Docker Integration Validation Results${NC}"
    echo -e "${PURPLE}========================================${NC}"
    
    if [ $failed -eq 0 ]; then
        log_success "All Docker integration tests passed! ✨"
        echo "Container is functioning correctly in production mode."
        echo ""
        echo "Container Details:"
        echo "- Port: $DOCKER_PORT"
        echo "- API Key: $TEST_API_KEY"
        echo "- Health Status: $(docker inspect foundry-relay-server --format='{{.State.Health.Status}}' 2>/dev/null || echo 'unknown')"
        echo "- Container ID: $(docker ps -q -f name=foundry-relay-server)"
        echo ""
        echo "Management Commands:"
        echo "- Stop: docker-compose down"
        echo "- Restart: docker-compose restart"
        echo "- Logs: docker-compose logs -f foundry-relay"
        echo "- Shell: docker exec -it foundry-relay-server sh"
        exit 0
    else
        log_error "$failed test(s) failed ❌"
        echo "Docker integration has issues that need investigation."
        echo ""
        echo "Troubleshooting:"
        echo "- Check logs: docker-compose logs foundry-relay"
        echo "- Check container: docker ps"
        echo "- Check volumes: docker volume ls"
        exit 1
    fi
}

# Run main function
main "$@"