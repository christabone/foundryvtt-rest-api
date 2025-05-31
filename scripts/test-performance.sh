#!/bin/bash
# Performance Testing Script for FoundryVTT Local Relay Server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Configuration
TEST_PORT=3001
API_KEY="test-performance-key-12345"
CONCURRENT_USERS=10
REQUESTS_PER_USER=50
LOAD_TEST_DURATION=30

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

log_perf() {
    echo -e "${PURPLE}[PERF]${NC} $1"
}

# Check if server is running
check_server() {
    log_info "Checking if server is running on port $TEST_PORT..."
    
    if curl -s http://localhost:$TEST_PORT/health > /dev/null 2>&1; then
        log_success "Server is running and responding"
        return 0
    else
        log_error "Server is not running on port $TEST_PORT"
        log_info "Please start the server first: npm run server:start"
        exit 1
    fi
}

# Measure response time for a single request
measure_response_time() {
    local url="$1"
    local method="${2:-GET}"
    local data="${3:-}"
    local headers="${4:-}"
    
    local curl_cmd="curl -s -w '%{time_total},%{http_code},%{size_download}' -o /dev/null"
    
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
    
    eval $curl_cmd
}

# Test single endpoint performance
test_endpoint_performance() {
    local endpoint="$1"
    local method="${2:-GET}"
    local data="${3:-}"
    local headers="${4:-}"
    local test_name="$5"
    
    log_perf "Testing $test_name performance..."
    
    local total_time=0
    local successful_requests=0
    local failed_requests=0
    local min_time=999999
    local max_time=0
    local times=()
    
    for i in $(seq 1 20); do
        local result=$(measure_response_time "$endpoint" "$method" "$data" "$headers")
        local time=$(echo $result | cut -d',' -f1)
        local status=$(echo $result | cut -d',' -f2)
        local size=$(echo $result | cut -d',' -f3)
        
        # Convert time to milliseconds
        local time_ms=$(echo "$time * 1000" | bc)
        times+=($time_ms)
        
        if [[ "$status" =~ ^(200|503)$ ]]; then
            ((successful_requests++))
            total_time=$(echo "$total_time + $time" | bc)
            
            # Update min/max
            if (( $(echo "$time < $min_time" | bc -l) )); then
                min_time=$time
            fi
            if (( $(echo "$time > $max_time" | bc -l) )); then
                max_time=$time
            fi
        else
            ((failed_requests++))
        fi
    done
    
    if [ $successful_requests -gt 0 ]; then
        local avg_time=$(echo "scale=3; $total_time / $successful_requests" | bc)
        local avg_time_ms=$(echo "$avg_time * 1000" | bc)
        local min_time_ms=$(echo "$min_time * 1000" | bc)
        local max_time_ms=$(echo "$max_time * 1000" | bc)
        
        # Calculate percentiles
        IFS=$'\n' sorted_times=($(sort -n <<<"${times[*]}"))
        local p50_index=$(( ${#sorted_times[@]} * 50 / 100 ))
        local p95_index=$(( ${#sorted_times[@]} * 95 / 100 ))
        local p50=${sorted_times[$p50_index]}
        local p95=${sorted_times[$p95_index]}
        
        log_success "$test_name Results:"
        echo "  Successful requests: $successful_requests/20"
        echo "  Failed requests: $failed_requests/20"
        echo "  Average response time: ${avg_time_ms}ms"
        echo "  Min response time: ${min_time_ms}ms"
        echo "  Max response time: ${max_time_ms}ms"
        echo "  P50 (median): ${p50}ms"
        echo "  P95: ${p95}ms"
        
        # Performance thresholds
        if (( $(echo "$avg_time_ms < 100" | bc -l) )); then
            log_success "Performance: EXCELLENT (< 100ms average)"
        elif (( $(echo "$avg_time_ms < 250" | bc -l) )); then
            log_success "Performance: GOOD (< 250ms average)"
        elif (( $(echo "$avg_time_ms < 500" | bc -l) )); then
            log_warn "Performance: ACCEPTABLE (< 500ms average)"
        else
            log_warn "Performance: NEEDS IMPROVEMENT (> 500ms average)"
        fi
    else
        log_error "$test_name: All requests failed"
    fi
    
    echo ""
}

# Concurrent user simulation
test_concurrent_users() {
    log_perf "Testing concurrent users performance..."
    
    local pids=()
    local temp_dir=$(mktemp -d)
    local start_time=$(date +%s)
    
    # Start concurrent user simulations
    for user in $(seq 1 $CONCURRENT_USERS); do
        (
            local user_requests=0
            local user_failures=0
            
            for request in $(seq 1 $REQUESTS_PER_USER); do
                if curl -s http://localhost:$TEST_PORT/health > /dev/null 2>&1; then
                    ((user_requests++))
                else
                    ((user_failures++))
                fi
                sleep 0.1 # Small delay between requests
            done
            
            echo "$user_requests,$user_failures" > "$temp_dir/user_$user.result"
        ) &
        pids+=($!)
    done
    
    # Wait for all users to complete
    for pid in "${pids[@]}"; do
        wait $pid
    done
    
    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))
    
    # Aggregate results
    local total_requests=0
    local total_failures=0
    
    for user in $(seq 1 $CONCURRENT_USERS); do
        if [ -f "$temp_dir/user_$user.result" ]; then
            local result=$(cat "$temp_dir/user_$user.result")
            local requests=$(echo $result | cut -d',' -f1)
            local failures=$(echo $result | cut -d',' -f2)
            total_requests=$((total_requests + requests))
            total_failures=$((total_failures + failures))
        fi
    done
    
    local success_rate=$(echo "scale=2; ($total_requests * 100) / ($total_requests + $total_failures)" | bc)
    local rps=$(echo "scale=2; $total_requests / $total_duration" | bc)
    
    log_success "Concurrent Users Test Results:"
    echo "  Concurrent users: $CONCURRENT_USERS"
    echo "  Requests per user: $REQUESTS_PER_USER"
    echo "  Total requests: $total_requests"
    echo "  Total failures: $total_failures"
    echo "  Success rate: ${success_rate}%"
    echo "  Duration: ${total_duration}s"
    echo "  Requests per second: $rps"
    
    # Cleanup
    rm -rf "$temp_dir"
    
    echo ""
}

# Memory usage monitoring
monitor_memory_usage() {
    log_perf "Monitoring memory usage during load test..."
    
    # Find server process
    local server_pid=$(lsof -ti:$TEST_PORT 2>/dev/null | head -1)
    
    if [ -z "$server_pid" ]; then
        log_warn "Could not find server process for memory monitoring"
        return
    fi
    
    local initial_memory=$(ps -p $server_pid -o rss= 2>/dev/null | tr -d ' ')
    log_info "Initial memory usage: ${initial_memory} KB"
    
    # Run load test while monitoring memory
    local memory_samples=()
    local duration=20
    
    # Background process to collect memory samples
    (
        for i in $(seq 1 $duration); do
            local current_memory=$(ps -p $server_pid -o rss= 2>/dev/null | tr -d ' ')
            if [ -n "$current_memory" ]; then
                echo $current_memory >> memory_samples.tmp
            fi
            sleep 1
        done
    ) &
    local monitor_pid=$!
    
    # Generate load
    local load_pids=()
    for i in $(seq 1 5); do
        (
            for j in $(seq 1 10); do
                curl -s http://localhost:$TEST_PORT/health > /dev/null 2>&1
                sleep 0.5
            done
        ) &
        load_pids+=($!)
    done
    
    # Wait for load test to complete
    for pid in "${load_pids[@]}"; do
        wait $pid
    done
    
    # Stop memory monitoring
    kill $monitor_pid 2>/dev/null || true
    wait $monitor_pid 2>/dev/null || true
    
    # Analyze memory usage
    if [ -f memory_samples.tmp ]; then
        local max_memory=$(sort -n memory_samples.tmp | tail -1)
        local memory_increase=$((max_memory - initial_memory))
        local memory_increase_percent=$(echo "scale=2; ($memory_increase * 100) / $initial_memory" | bc)
        
        log_success "Memory Usage Analysis:"
        echo "  Initial memory: ${initial_memory} KB"
        echo "  Peak memory: ${max_memory} KB"
        echo "  Memory increase: ${memory_increase} KB (${memory_increase_percent}%)"
        
        if (( $(echo "$memory_increase_percent < 20" | bc -l) )); then
            log_success "Memory usage: EXCELLENT (< 20% increase)"
        elif (( $(echo "$memory_increase_percent < 50" | bc -l) )); then
            log_success "Memory usage: GOOD (< 50% increase)"
        else
            log_warn "Memory usage: NEEDS ATTENTION (> 50% increase)"
        fi
        
        rm -f memory_samples.tmp
    else
        log_warn "Could not collect memory samples"
    fi
    
    echo ""
}

# Generate performance report
generate_performance_report() {
    log_info "Generating performance report..."
    
    local report_file="performance-report-$(date +%Y%m%d-%H%M%S).json"
    
    cat > "$report_file" << EOF
{
  "test_timestamp": "$(date -Iseconds)",
  "server_info": {
    "port": $TEST_PORT,
    "node_version": "$(node --version)",
    "os": "$(uname -s)",
    "architecture": "$(uname -m)"
  },
  "test_configuration": {
    "concurrent_users": $CONCURRENT_USERS,
    "requests_per_user": $REQUESTS_PER_USER,
    "load_test_duration": $LOAD_TEST_DURATION
  },
  "test_results": {
    "note": "Detailed results available in performance test logs"
  }
}
EOF
    
    log_success "Performance report generated: $report_file"
}

# Main execution
main() {
    echo -e "${PURPLE}========================================${NC}"
    echo -e "${PURPLE}FoundryVTT Local Relay Server${NC}"
    echo -e "${PURPLE}Performance Test Suite${NC}"
    echo -e "${PURPLE}========================================${NC}"
    
    # Check dependencies
    if ! command -v bc &> /dev/null; then
        log_error "bc (calculator) is required for performance calculations"
        log_info "Install with: sudo apt-get install bc (Ubuntu/Debian) or brew install bc (macOS)"
        exit 1
    fi
    
    check_server
    
    echo -e "\n${PURPLE}1. Single Endpoint Performance Tests${NC}"
    test_endpoint_performance "http://localhost:$TEST_PORT/health" "GET" "" "" "Health Endpoint"
    test_endpoint_performance "http://localhost:$TEST_PORT/api/status" "GET" "" "" "Status Endpoint"
    test_endpoint_performance "http://localhost:$TEST_PORT/api/docs" "GET" "" "" "API Documentation"
    test_endpoint_performance "http://localhost:$TEST_PORT/api/search" "POST" '{"query":"test"}' "x-api-key: $API_KEY" "Search Endpoint"
    
    echo -e "\n${PURPLE}2. Concurrent Users Test${NC}"
    test_concurrent_users
    
    echo -e "\n${PURPLE}3. Memory Usage Monitoring${NC}"
    monitor_memory_usage
    
    generate_performance_report
    
    echo -e "\n${PURPLE}========================================${NC}"
    echo -e "${GREEN}Performance testing completed!${NC}"
    echo -e "${PURPLE}========================================${NC}"
}

# Run main function
main "$@"