#!/bin/bash
# Comprehensive Test Runner for FoundryVTT Local Relay Server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPORTS_DIR="$PROJECT_ROOT/test-reports"

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
    echo -e "${CYAN}[SECTION]${NC} $1"
}

# Print usage information
print_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Comprehensive test runner for FoundryVTT Local Relay Server

OPTIONS:
    -h, --help              Show this help message
    -u, --unit-only         Run only unit tests
    -i, --integration-only  Run only integration tests
    -p, --performance-only  Run only performance tests
    -s, --skip-build        Skip the build step
    -c, --coverage          Generate test coverage report
    -v, --verbose           Enable verbose output
    --clean                 Clean test artifacts before running
    --docker                Run tests in Docker container

EXAMPLES:
    $0                      Run all tests
    $0 --unit-only          Run only unit tests
    $0 --integration-only   Run integration tests
    $0 --coverage           Run tests with coverage
    $0 --docker             Run tests in Docker
EOF
}

# Parse command line arguments
parse_args() {
    UNIT_ONLY=false
    INTEGRATION_ONLY=false
    PERFORMANCE_ONLY=false
    SKIP_BUILD=false
    COVERAGE=false
    VERBOSE=false
    CLEAN=false
    DOCKER=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                print_usage
                exit 0
                ;;
            -u|--unit-only)
                UNIT_ONLY=true
                shift
                ;;
            -i|--integration-only)
                INTEGRATION_ONLY=true
                shift
                ;;
            -p|--performance-only)
                PERFORMANCE_ONLY=true
                shift
                ;;
            -s|--skip-build)
                SKIP_BUILD=true
                shift
                ;;
            -c|--coverage)
                COVERAGE=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            --clean)
                CLEAN=true
                shift
                ;;
            --docker)
                DOCKER=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done
}

# Clean test artifacts
clean_artifacts() {
    log_section "Cleaning test artifacts..."
    
    cd "$PROJECT_ROOT"
    
    # Remove test output files
    rm -f test-*.log
    rm -f integration-test-report-*.txt
    rm -f performance-report-*.json
    rm -f memory_samples.tmp
    rm -f .env.test
    
    # Remove test data
    rm -rf server/data/test-*
    
    # Remove coverage reports
    rm -rf coverage/
    
    # Remove node_modules if requested
    if [ "$VERBOSE" = true ]; then
        log_info "Cleaning node_modules..."
        rm -rf node_modules/
    fi
    
    log_success "Test artifacts cleaned"
}

# Setup test environment
setup_environment() {
    log_section "Setting up test environment..."
    
    cd "$PROJECT_ROOT"
    
    # Create reports directory
    mkdir -p "$REPORTS_DIR"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ] || [ "$CLEAN" = true ]; then
        log_info "Installing dependencies..."
        npm ci
    fi
    
    # Create test data directory
    mkdir -p server/data
    
    log_success "Test environment ready"
}

# Build project
build_project() {
    if [ "$SKIP_BUILD" = true ]; then
        log_info "Skipping build step"
        return 0
    fi
    
    log_section "Building project..."
    
    cd "$PROJECT_ROOT"
    
    if npm run server:build; then
        log_success "Project built successfully"
    else
        log_error "Project build failed"
        return 1
    fi
}

# Run unit tests
run_unit_tests() {
    log_section "Running unit tests..."
    
    cd "$PROJECT_ROOT"
    
    local test_cmd="npm run test:unit"
    
    if [ "$COVERAGE" = true ]; then
        test_cmd="npm run test:coverage"
    fi
    
    local unit_report="$REPORTS_DIR/unit-test-report-$(date +%Y%m%d-%H%M%S).xml"
    
    if [ "$VERBOSE" = true ]; then
        log_info "Running: $test_cmd"
    fi
    
    if $test_cmd 2>&1 | tee "$REPORTS_DIR/unit-tests.log"; then
        log_success "Unit tests passed"
        return 0
    else
        log_error "Unit tests failed"
        return 1
    fi
}

# Run integration tests
run_integration_tests() {
    log_section "Running integration tests..."
    
    cd "$PROJECT_ROOT"
    
    local integration_script="$SCRIPT_DIR/test-integration.sh"
    
    if [ ! -f "$integration_script" ]; then
        log_error "Integration test script not found: $integration_script"
        return 1
    fi
    
    if [ "$VERBOSE" = true ]; then
        log_info "Running integration tests..."
    fi
    
    if "$integration_script" 2>&1 | tee "$REPORTS_DIR/integration-tests.log"; then
        log_success "Integration tests passed"
        
        # Move generated reports to reports directory
        mv integration-test-report-*.txt "$REPORTS_DIR/" 2>/dev/null || true
        mv test-integration-results.log "$REPORTS_DIR/" 2>/dev/null || true
        
        return 0
    else
        log_error "Integration tests failed"
        return 1
    fi
}

# Run performance tests
run_performance_tests() {
    log_section "Running performance tests..."
    
    cd "$PROJECT_ROOT"
    
    local performance_script="$SCRIPT_DIR/test-performance.sh"
    
    if [ ! -f "$performance_script" ]; then
        log_error "Performance test script not found: $performance_script"
        return 1
    fi
    
    # Check if server is running for performance tests
    if ! curl -s http://localhost:3001/health > /dev/null 2>&1; then
        log_info "Starting server for performance tests..."
        npm run server:start > "$REPORTS_DIR/perf-server.log" 2>&1 &
        SERVER_PID=$!
        
        # Wait for server to start
        local retries=10
        while [ $retries -gt 0 ]; do
            if curl -s http://localhost:3001/health > /dev/null 2>&1; then
                break
            fi
            sleep 2
            ((retries--))
        done
        
        if [ $retries -eq 0 ]; then
            log_error "Failed to start server for performance tests"
            return 1
        fi
        
        STARTED_SERVER=true
    fi
    
    if [ "$VERBOSE" = true ]; then
        log_info "Running performance tests..."
    fi
    
    if "$performance_script" 2>&1 | tee "$REPORTS_DIR/performance-tests.log"; then
        log_success "Performance tests completed"
        
        # Move generated reports to reports directory
        mv performance-report-*.json "$REPORTS_DIR/" 2>/dev/null || true
        
        result=0
    else
        log_error "Performance tests failed"
        result=1
    fi
    
    # Stop server if we started it
    if [ "$STARTED_SERVER" = true ] && [ -n "$SERVER_PID" ]; then
        log_info "Stopping test server..."
        kill $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
    fi
    
    return $result
}

# Run Docker tests
run_docker_tests() {
    log_section "Running Docker tests..."
    
    cd "$PROJECT_ROOT"
    
    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        return 1
    fi
    
    # Build Docker image
    log_info "Building Docker image..."
    if ! docker build -t foundry-relay-test .; then
        log_error "Failed to build Docker image"
        return 1
    fi
    
    # Run tests in Docker container
    log_info "Running tests in Docker container..."
    
    local docker_cmd="docker run --rm -v \"$REPORTS_DIR:/app/reports\" foundry-relay-test"
    
    if [ "$VERBOSE" = true ]; then
        docker_cmd="$docker_cmd npm run test"
    else
        docker_cmd="$docker_cmd npm run test:unit"
    fi
    
    if eval $docker_cmd 2>&1 | tee "$REPORTS_DIR/docker-tests.log"; then
        log_success "Docker tests passed"
        return 0
    else
        log_error "Docker tests failed"
        return 1
    fi
}

# Generate comprehensive test report
generate_final_report() {
    log_section "Generating comprehensive test report..."
    
    local report_file="$REPORTS_DIR/comprehensive-test-report-$(date +%Y%m%d-%H%M%S).html"
    
    cat > "$report_file" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>FoundryVTT Local Relay Server - Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .success { background: #d4edda; border-color: #c3e6cb; color: #155724; }
        .failure { background: #f8d7da; border-color: #f5c6cb; color: #721c24; }
        .info { background: #cce7ff; border-color: #b8daff; color: #004085; }
        pre { background: #f8f9fa; padding: 10px; border-radius: 3px; overflow-x: auto; }
        .timestamp { color: #6c757d; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>FoundryVTT Local Relay Server</h1>
        <h2>Comprehensive Test Report</h2>
        <p class="timestamp">Generated: $(date)</p>
    </div>
    
    <div class="section info">
        <h3>Test Configuration</h3>
        <ul>
            <li>Node.js Version: $(node --version)</li>
            <li>npm Version: $(npm --version)</li>
            <li>Operating System: $(uname -s) $(uname -r)</li>
            <li>Architecture: $(uname -m)</li>
            <li>Test Options: Unit=$([ "$UNIT_ONLY" = true ] && echo "Yes" || echo "No"), Integration=$([ "$INTEGRATION_ONLY" = true ] && echo "Yes" || echo "No"), Performance=$([ "$PERFORMANCE_ONLY" = true ] && echo "Yes" || echo "No")</li>
            <li>Coverage: $([ "$COVERAGE" = true ] && echo "Enabled" || echo "Disabled")</li>
            <li>Docker: $([ "$DOCKER" = true ] && echo "Yes" || echo "No")</li>
        </ul>
    </div>
    
    <div class="section">
        <h3>Test Results Summary</h3>
        <p>Check individual log files in the reports directory for detailed results:</p>
        <ul>
$(find "$REPORTS_DIR" -name "*.log" -type f | while read logfile; do
    echo "            <li><code>$(basename "$logfile")</code></li>"
done)
        </ul>
    </div>
    
    <div class="section">
        <h3>Generated Reports</h3>
        <ul>
$(find "$REPORTS_DIR" -name "*.json" -o -name "*.xml" -o -name "*.txt" | while read reportfile; do
    echo "            <li><code>$(basename "$reportfile")</code></li>"
done)
        </ul>
    </div>
    
    <div class="section">
        <h3>Coverage Information</h3>
$(if [ "$COVERAGE" = true ] && [ -d "coverage" ]; then
    echo "        <p>Coverage report available in <code>coverage/</code> directory</p>"
else
    echo "        <p>Coverage not generated for this test run</p>"
fi)
    </div>
</body>
</html>
EOF
    
    log_success "Comprehensive test report generated: $report_file"
    
    # Also create a summary JSON report
    local json_report="$REPORTS_DIR/test-summary.json"
    cat > "$json_report" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "configuration": {
    "unit_only": $UNIT_ONLY,
    "integration_only": $INTEGRATION_ONLY,
    "performance_only": $PERFORMANCE_ONLY,
    "coverage": $COVERAGE,
    "docker": $DOCKER,
    "node_version": "$(node --version)",
    "npm_version": "$(npm --version)",
    "os": "$(uname -s)",
    "architecture": "$(uname -m)"
  },
  "reports_directory": "$REPORTS_DIR",
  "log_files": [
$(find "$REPORTS_DIR" -name "*.log" -type f | sed 's/.*/"&"/' | paste -sd, -)
  ]
}
EOF
    
    log_success "Test summary JSON generated: $json_report"
}

# Main execution
main() {
    local start_time=$(date +%s)
    
    echo -e "${PURPLE}================================================${NC}"
    echo -e "${PURPLE}FoundryVTT Local Relay Server${NC}"
    echo -e "${PURPLE}Comprehensive Test Suite Runner${NC}"
    echo -e "${PURPLE}================================================${NC}"
    
    # Parse arguments
    parse_args "$@"
    
    # Show configuration
    log_info "Test Configuration:"
    echo "  Unit tests only: $UNIT_ONLY"
    echo "  Integration tests only: $INTEGRATION_ONLY"  
    echo "  Performance tests only: $PERFORMANCE_ONLY"
    echo "  Skip build: $SKIP_BUILD"
    echo "  Coverage: $COVERAGE"
    echo "  Verbose: $VERBOSE"
    echo "  Clean: $CLEAN"
    echo "  Docker: $DOCKER"
    echo ""
    
    # Track test results
    local test_results=()
    local exit_code=0
    
    # Clean if requested
    if [ "$CLEAN" = true ]; then
        clean_artifacts
    fi
    
    # Setup environment
    if ! setup_environment; then
        log_error "Failed to setup test environment"
        exit 1
    fi
    
    # Build project
    if ! build_project; then
        log_error "Build failed"
        exit 1
    fi
    
    # Run tests based on options
    if [ "$DOCKER" = true ]; then
        if run_docker_tests; then
            test_results+=("Docker Tests: PASS")
        else
            test_results+=("Docker Tests: FAIL")
            exit_code=1
        fi
    elif [ "$UNIT_ONLY" = true ]; then
        if run_unit_tests; then
            test_results+=("Unit Tests: PASS")
        else
            test_results+=("Unit Tests: FAIL")
            exit_code=1
        fi
    elif [ "$INTEGRATION_ONLY" = true ]; then
        if run_integration_tests; then
            test_results+=("Integration Tests: PASS")
        else
            test_results+=("Integration Tests: FAIL")
            exit_code=1
        fi
    elif [ "$PERFORMANCE_ONLY" = true ]; then
        if run_performance_tests; then
            test_results+=("Performance Tests: PASS")
        else
            test_results+=("Performance Tests: FAIL")
            exit_code=1
        fi
    else
        # Run all tests
        if run_unit_tests; then
            test_results+=("Unit Tests: PASS")
        else
            test_results+=("Unit Tests: FAIL")
            exit_code=1
        fi
        
        if run_integration_tests; then
            test_results+=("Integration Tests: PASS")
        else
            test_results+=("Integration Tests: FAIL")
            exit_code=1
        fi
        
        if run_performance_tests; then
            test_results+=("Performance Tests: PASS")
        else
            test_results+=("Performance Tests: FAIL")
            exit_code=1
        fi
    fi
    
    # Generate final report
    generate_final_report
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Print final summary
    echo -e "\n${PURPLE}================================================${NC}"
    echo -e "${PURPLE}TEST EXECUTION SUMMARY${NC}"
    echo -e "${PURPLE}================================================${NC}"
    
    for result in "${test_results[@]}"; do
        if [[ $result == *"PASS"* ]]; then
            echo -e "${GREEN}✓${NC} $result"
        else
            echo -e "${RED}✗${NC} $result"
        fi
    done
    
    echo -e "\n${BLUE}Total execution time: ${duration}s${NC}"
    echo -e "${BLUE}Reports directory: $REPORTS_DIR${NC}"
    
    if [ $exit_code -eq 0 ]; then
        echo -e "\n${GREEN}🎉 All tests completed successfully!${NC}"
    else
        echo -e "\n${RED}❌ Some tests failed. Check the reports for details.${NC}"
    fi
    
    exit $exit_code
}

# Run main function with all arguments
main "$@"