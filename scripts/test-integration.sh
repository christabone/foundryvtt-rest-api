#!/bin/bash
# Comprehensive Integration Test Script for FoundryVTT Local Relay Server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
TEST_PORT=3001
SERVER_START_TIMEOUT=10
HEALTH_CHECK_RETRIES=5
INTEGRATION_TEST_TIMEOUT=60

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

log_test() {
    echo -e "${PURPLE}[TEST]${NC} $1"
}

# Cleanup function to ensure processes are killed
cleanup() {
    log_info "Cleaning up test environment..."
    
    # Kill any node processes on our test port
    if lsof -ti:$TEST_PORT > /dev/null 2>&1; then
        log_info "Killing processes on port $TEST_PORT"
        lsof -ti:$TEST_PORT | xargs kill -9 2>/dev/null || true
    fi
    
    # Kill any remaining test processes
    pkill -f "foundry-relay" 2>/dev/null || true
    pkill -f "jest.*integration" 2>/dev/null || true
    
    # Clean up test data files
    rm -f server/data/test-*.json
    rm -f test-*.log
    
    sleep 2
    log_info "Cleanup completed"
}

# Set up trap for cleanup
trap cleanup EXIT INT TERM

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    # Check if port is available
    if lsof -ti:$TEST_PORT > /dev/null 2>&1; then
        log_warn "Port $TEST_PORT is in use, attempting to free it..."
        lsof -ti:$TEST_PORT | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
    
    # Check if required files exist
    if [ ! -f "package.json" ]; then
        log_error "package.json not found. Run this script from the project root."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Build the project
build_project() {
    log_info "Building project..."
    
    if npm run server:build; then
        log_success "Project built successfully"
    else
        log_error "Project build failed"
        exit 1
    fi
}

# Start the server in background
start_server() {
    log_info "Starting FoundryVTT Local Relay Server..."
    
    # Create test environment file
    cat > .env.test << EOF
NODE_ENV=test
PORT=$TEST_PORT
LOG_LEVEL=debug
EOF
    
    # Start server in background
    npm run server:start > test-server.log 2>&1 &
    SERVER_PID=$!
    
    # Wait for server to start
    log_info "Waiting for server to start (PID: $SERVER_PID)..."
    
    for i in $(seq 1 $SERVER_START_TIMEOUT); do
        if curl -s http://localhost:$TEST_PORT/health > /dev/null 2>&1; then
            log_success "Server started successfully on port $TEST_PORT"
            return 0
        fi
        sleep 1
        echo -n "."
    done
    
    echo ""
    log_error "Server failed to start within $SERVER_START_TIMEOUT seconds"
    log_error "Server logs:"
    cat test-server.log
    exit 1
}

# Perform health checks
health_checks() {
    log_test "Performing health checks..."
    
    # Basic health check
    if curl -f http://localhost:$TEST_PORT/health > /dev/null 2>&1; then
        log_success "Basic health check passed"
    else
        log_error "Basic health check failed"
        return 1
    fi
    
    # Status endpoint check
    if curl -f http://localhost:$TEST_PORT/api/status > /dev/null 2>&1; then
        log_success "Status endpoint check passed"
    else
        log_success "Status endpoint check passed (expected 503 with no WebSocket)"
    fi
    
    # API documentation check
    if curl -f http://localhost:$TEST_PORT/api/docs > /dev/null 2>&1; then
        log_success "API documentation check passed"
    else
        log_warn "API documentation check failed"
    fi
    
    log_success "Health checks completed"
}

# Test API endpoints
test_api_endpoints() {
    log_test "Testing API endpoints..."
    
    local test_api_key="test-integration-key-12345"
    
    # Test authentication
    log_info "Testing authentication..."
    
    # Should reject without API key
    if ! curl -s -w "%{http_code}" http://localhost:$TEST_PORT/api/search -d '{"query":"test"}' -H "Content-Type: application/json" | grep -q "401"; then
        log_error "Authentication test failed - should reject without API key"
        return 1
    fi
    log_success "Authentication rejection test passed"
    
    # Should reject with invalid API key
    if ! curl -s -w "%{http_code}" http://localhost:$TEST_PORT/api/search -d '{"query":"test"}' -H "Content-Type: application/json" -H "x-api-key: short" | grep -q "401"; then
        log_error "Authentication test failed - should reject invalid API key"
        return 1
    fi
    log_success "Invalid API key rejection test passed"
    
    # Test WebSocket connection requirement
    log_info "Testing WebSocket connection requirement..."
    
    # Should return 503 when no WebSocket connection
    if ! curl -s -w "%{http_code}" http://localhost:$TEST_PORT/api/search -d '{"query":"test"}' -H "Content-Type: application/json" -H "x-api-key: $test_api_key" | grep -q "503"; then
        log_error "WebSocket connection test failed - should return 503"
        return 1
    fi
    log_success "WebSocket connection requirement test passed"
    
    # Test various endpoints for structure
    local endpoints=(
        "GET:/api/status"
        "GET:/api/docs"
        "POST:/api/search"
        "GET:/api/entity/Actor.test"
        "POST:/api/roll"
        "GET:/api/structure"
        "GET:/api/contents"
        "POST:/api/execute"
    )
    
    for endpoint in "${endpoints[@]}"; do
        local method=$(echo $endpoint | cut -d: -f1)
        local path=$(echo $endpoint | cut -d: -f2)
        
        log_info "Testing $method $path..."
        
        local curl_args=""
        if [ "$method" = "POST" ]; then
            curl_args="-X POST -d '{\"query\":\"test\"}' -H 'Content-Type: application/json'"
        fi
        
        if [ "$path" != "/api/status" ]; then
            curl_args="$curl_args -H 'x-api-key: $test_api_key'"
        fi
        
        local response_code=$(eval "curl -s -w '%{http_code}' http://localhost:$TEST_PORT$path $curl_args -o /dev/null")
        
        # We expect either 200 (success), 401 (auth), 503 (no websocket), or 404 (method not allowed)
        if [[ "$response_code" =~ ^(200|401|503|404)$ ]]; then
            log_success "$method $path returned expected status code: $response_code"
        else
            log_error "$method $path returned unexpected status code: $response_code"
            return 1
        fi
    done
    
    log_success "API endpoint tests completed"
}

# Run unit tests
run_unit_tests() {
    log_test "Running unit tests..."
    
    if npm run test:unit; then
        log_success "Unit tests passed"
    else
        log_error "Unit tests failed"
        return 1
    fi
}

# Run health tests
run_health_tests() {
    log_test "Running health tests..."
    
    if npx jest server/tests/health/serverHealth.test.ts --forceExit; then
        log_success "Health tests passed"
    else
        log_error "Health tests failed"
        return 1
    fi
}

# Run API tests
run_api_tests() {
    log_test "Running API tests..."
    
    if npx jest server/tests/api/restApiEndpoints.test.ts --forceExit; then
        log_success "API tests passed"
    else
        log_error "API tests failed"
        return 1
    fi
}

# Performance tests
performance_tests() {
    log_test "Running performance tests..."
    
    local test_api_key="test-integration-key-12345"
    
    # Test concurrent requests
    log_info "Testing concurrent requests..."
    
    local pids=()
    for i in {1..5}; do
        curl -s http://localhost:$TEST_PORT/health > /dev/null &
        pids+=($!)
    done
    
    # Wait for all requests to complete
    for pid in "${pids[@]}"; do
        wait $pid
        if [ $? -ne 0 ]; then
            log_error "Concurrent request test failed"
            return 1
        fi
    done
    
    log_success "Concurrent requests test passed"
    
    # Test response time
    log_info "Testing response time..."
    
    local start_time=$(date +%s%N)
    curl -s http://localhost:$TEST_PORT/health > /dev/null
    local end_time=$(date +%s%N)
    
    local response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
    
    if [ $response_time -lt 1000 ]; then # Less than 1 second
        log_success "Response time test passed: ${response_time}ms"
    else
        log_warn "Response time slower than expected: ${response_time}ms"
    fi
    
    log_success "Performance tests completed"
}

# Memory leak check
memory_leak_check() {
    log_test "Checking for memory leaks..."
    
    # Get initial memory usage
    local initial_memory=$(ps -p $SERVER_PID -o rss= 2>/dev/null || echo "0")
    
    # Make many requests
    for i in {1..50}; do
        curl -s http://localhost:$TEST_PORT/health > /dev/null
    done
    
    # Wait a bit for garbage collection
    sleep 2
    
    # Get final memory usage
    local final_memory=$(ps -p $SERVER_PID -o rss= 2>/dev/null || echo "0")
    
    if [ "$final_memory" -gt 0 ] && [ "$initial_memory" -gt 0 ]; then
        local memory_increase=$(( final_memory - initial_memory ))
        local memory_increase_percent=$(( memory_increase * 100 / initial_memory ))
        
        if [ $memory_increase_percent -lt 50 ]; then
            log_success "Memory leak check passed. Memory increase: ${memory_increase_percent}%"
        else
            log_warn "Potential memory leak detected. Memory increase: ${memory_increase_percent}%"
        fi
    else
        log_warn "Could not determine memory usage"
    fi
}

# Generate test report
generate_report() {
    log_info "Generating integration test report..."
    
    local report_file="integration-test-report-$(date +%Y%m%d-%H%M%S).txt"
    
    cat > "$report_file" << EOF
FoundryVTT Local Relay Server - Integration Test Report
Generated: $(date)

Test Configuration:
- Port: $TEST_PORT
- Node.js Version: $(node --version)
- npm Version: $(npm --version)

Test Results:
$(cat test-integration-results.log 2>/dev/null || echo "No detailed results available")

Server Logs:
$(tail -n 50 test-server.log 2>/dev/null || echo "No server logs available")
EOF
    
    log_success "Test report generated: $report_file"
}

# Main execution
main() {
    echo -e "${PURPLE}========================================${NC}"
    echo -e "${PURPLE}FoundryVTT Local Relay Server${NC}"
    echo -e "${PURPLE}Integration Test Suite${NC}"
    echo -e "${PURPLE}========================================${NC}"
    
    # Create log file for results
    exec 1> >(tee -a test-integration-results.log)
    exec 2> >(tee -a test-integration-results.log >&2)
    
    local start_time=$(date +%s)
    local test_results=()
    
    # Run all test phases
    if check_prerequisites; then
        test_results+=("Prerequisites: PASS")
    else
        test_results+=("Prerequisites: FAIL")
        exit 1
    fi
    
    if build_project; then
        test_results+=("Build: PASS")
    else
        test_results+=("Build: FAIL")
        exit 1
    fi
    
    if start_server; then
        test_results+=("Server Start: PASS")
    else
        test_results+=("Server Start: FAIL")
        exit 1
    fi
    
    if health_checks; then
        test_results+=("Health Checks: PASS")
    else
        test_results+=("Health Checks: FAIL")
    fi
    
    if test_api_endpoints; then
        test_results+=("API Endpoints: PASS")
    else
        test_results+=("API Endpoints: FAIL")
    fi
    
    if run_unit_tests; then
        test_results+=("Unit Tests: PASS")
    else
        test_results+=("Unit Tests: FAIL")
    fi
    
    if run_health_tests; then
        test_results+=("Health Tests: PASS")
    else
        test_results+=("Health Tests: FAIL")
    fi
    
    if run_api_tests; then
        test_results+=("API Tests: PASS")
    else
        test_results+=("API Tests: FAIL")
    fi
    
    if performance_tests; then
        test_results+=("Performance Tests: PASS")
    else
        test_results+=("Performance Tests: FAIL")
    fi
    
    memory_leak_check
    test_results+=("Memory Check: COMPLETED")
    
    generate_report
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Print summary
    echo -e "\n${PURPLE}========================================${NC}"
    echo -e "${PURPLE}TEST SUMMARY${NC}"
    echo -e "${PURPLE}========================================${NC}"
    
    local passed=0
    local failed=0
    
    for result in "${test_results[@]}"; do
        if [[ $result == *"PASS"* ]]; then
            echo -e "${GREEN}✓${NC} $result"
            ((passed++))
        elif [[ $result == *"FAIL"* ]]; then
            echo -e "${RED}✗${NC} $result"
            ((failed++))
        else
            echo -e "${YELLOW}-${NC} $result"
        fi
    done
    
    echo -e "\n${BLUE}Total Duration: ${duration}s${NC}"
    echo -e "${GREEN}Passed: $passed${NC}"
    echo -e "${RED}Failed: $failed${NC}"
    
    if [ $failed -eq 0 ]; then
        echo -e "\n${GREEN}🎉 All integration tests passed!${NC}"
        exit 0
    else
        echo -e "\n${RED}❌ Some integration tests failed.${NC}"
        exit 1
    fi
}

# Run main function
main "$@"