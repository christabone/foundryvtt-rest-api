#!/bin/bash
# Smoke Test Script for FoundryVTT Local Relay Server
# Quick validation that basic functionality works

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

TEST_PORT=${TEST_PORT:-3001}
API_KEY="test-smoke-key-12345"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
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
    echo "🔥 FoundryVTT Local Relay Server - Smoke Tests"
    echo "=============================================="
    
    local base_url="http://localhost:$TEST_PORT"
    local failed=0
    
    # Check if server is running
    if ! curl -s "$base_url/health" > /dev/null 2>&1; then
        log_error "Server is not running on port $TEST_PORT"
        echo "Start the server with: npm run server:start"
        exit 1
    fi
    
    log_info "Testing basic endpoints..."
    
    # Basic health check
    test_endpoint "Health Check" "$base_url/health" "200" || ((failed++))
    
    # API documentation
    test_endpoint "API Documentation" "$base_url/api/docs" "200" || ((failed++))
    
    # Status endpoint (no auth required)
    test_endpoint "Status Endpoint" "$base_url/api/status" "200" "GET" "" "" || {
        # 503 is also acceptable (no WebSocket connection)
        test_endpoint "Status Endpoint (No WS)" "$base_url/api/status" "503" || ((failed++))
    }
    
    # Authentication tests
    test_endpoint "Auth Required" "$base_url/api/search" "401" "POST" '{"query":"test"}' || ((failed++))
    test_endpoint "Invalid API Key" "$base_url/api/search" "401" "POST" '{"query":"test"}' "x-api-key: short" || ((failed++))
    
    # WebSocket requirement (with valid auth)
    test_endpoint "WebSocket Required" "$base_url/api/search" "503" "POST" '{"query":"test"}' "x-api-key: $API_KEY" || ((failed++))
    
    # Test various endpoints exist
    test_endpoint "Entity Endpoint" "$base_url/api/entity/Actor.test" "503" "GET" "" "x-api-key: $API_KEY" || ((failed++))
    test_endpoint "Roll Endpoint" "$base_url/api/roll" "503" "POST" '{"formula":"1d20"}' "x-api-key: $API_KEY" || ((failed++))
    test_endpoint "Structure Endpoint" "$base_url/api/structure" "503" "GET" "" "x-api-key: $API_KEY" || ((failed++))
    
    # 404 tests
    test_endpoint "Non-existent Endpoint" "$base_url/api/nonexistent" "404" || ((failed++))
    test_endpoint "Wrong Method" "$base_url/api/search" "404" "GET" "" "x-api-key: $API_KEY" || ((failed++))
    
    echo ""
    echo "=============================================="
    
    if [ $failed -eq 0 ]; then
        log_success "All smoke tests passed! ✨"
        echo "Server is functioning correctly."
        exit 0
    else
        log_error "$failed test(s) failed ❌"
        echo "Server may have issues that need investigation."
        exit 1
    fi
}

main "$@"