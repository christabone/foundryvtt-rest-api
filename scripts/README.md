# Scripts Directory

This directory contains utility scripts for building, deploying, and managing the FoundryVTT Local Relay Server.

## Available Scripts

### `build.sh` - Docker Image Builder
Builds the Docker image with optional testing.

```bash
# Basic build
./scripts/build.sh

# Build with specific tag
./scripts/build.sh v1.0.0

# Build with custom Dockerfile
./scripts/build.sh latest Dockerfile.prod

# Build and test
./scripts/build.sh latest Dockerfile . --test
```

**Parameters:**
- `$1` - Tag (default: latest)
- `$2` - Dockerfile path (default: Dockerfile)
- `$3` - Build context (default: .)
- `$4` - Test flag (--test to run quick test)

### `deploy.sh` - Deployment Manager
Manages Docker Compose deployments.

```bash
# Deploy production
./scripts/deploy.sh

# Deploy with custom files
./scripts/deploy.sh docker-compose.dev.yml .env.dev

# Check status
./scripts/deploy.sh docker-compose.yml .env status

# Restart services
./scripts/deploy.sh docker-compose.yml .env restart

# Stop services
./scripts/deploy.sh docker-compose.yml .env stop
```

**Parameters:**
- `$1` - Docker Compose file (default: docker-compose.yml)
- `$2` - Environment file (default: .env)
- `$3` - Action: deploy, status, stop, restart (default: deploy)

### `health-check.sh` - Health Monitor
Performs comprehensive health checks on the running server.

```bash
# Basic health check
./scripts/health-check.sh

# Custom configuration
HEALTH_URL=http://localhost:3002/health ./scripts/health-check.sh
HEALTH_TIMEOUT=10 HEALTH_MAX_RETRIES=5 ./scripts/health-check.sh
```

**Environment Variables:**
- `HEALTH_URL` - Health endpoint URL (default: http://localhost:3001/health)
- `HEALTH_TIMEOUT` - Request timeout in seconds (default: 5)
- `HEALTH_MAX_RETRIES` - Maximum retry attempts (default: 3)

## Usage Examples

### Development Workflow
```bash
# Start development environment
./scripts/deploy.sh docker-compose.dev.yml .env.dev deploy

# Check if everything is working
./scripts/health-check.sh

# View status and logs
./scripts/deploy.sh docker-compose.dev.yml .env.dev status
```

### Production Deployment
```bash
# Build production image
./scripts/build.sh production

# Deploy to production
./scripts/deploy.sh docker-compose.yml .env.production deploy

# Monitor health
./scripts/health-check.sh
```

### CI/CD Integration
```bash
# In your CI/CD pipeline
./scripts/build.sh ${CI_COMMIT_SHA} Dockerfile . --test
./scripts/deploy.sh docker-compose.staging.yml .env.staging deploy
./scripts/health-check.sh
```

### Troubleshooting
```bash
# Check deployment status
./scripts/deploy.sh docker-compose.yml .env status

# Restart if needed
./scripts/deploy.sh docker-compose.yml .env restart

# Run health check with verbose output
HEALTH_MAX_RETRIES=1 ./scripts/health-check.sh
```

## Script Features

### Error Handling
- All scripts use `set -e` for immediate exit on errors
- Comprehensive error messages with context
- Proper exit codes for CI/CD integration

### Logging
- Color-coded output for better readability
- Timestamped log messages
- Separate functions for different log levels (info, warn, error, success)

### Safety Checks
- Prerequisites validation (Docker, Docker Compose)
- File existence verification
- Service health validation
- Resource availability checks

### Flexibility
- Environment variable overrides
- Command-line parameter support
- Multiple deployment configurations
- Custom Docker configurations

## Security Considerations

### File Permissions
```bash
# Scripts should be executable
chmod +x scripts/*.sh

# But not writable by others
chmod 755 scripts/*.sh
```

### Environment Files
- Scripts respect `.env` file security
- No sensitive information logged
- Environment files validated before use

### Container Security
- Scripts run containers as non-root user
- Security scanning integration available
- Health checks prevent compromised deployments

## Extending the Scripts

### Adding New Scripts
1. Create script in `scripts/` directory
2. Follow existing naming convention
3. Include proper error handling and logging
4. Add documentation to this README
5. Make executable: `chmod +x scripts/new-script.sh`

### Script Template
```bash
#!/bin/bash
# Description of what this script does

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Your script logic here
main() {
    log_info "Starting script..."
    # Implementation
    log_success "Script completed!"
}

main "$@"
```

## Maintenance

### Regular Tasks
- Review script logs for errors
- Update script dependencies
- Test scripts with new Docker versions
- Update documentation as needed

### Version Control
- All scripts are version controlled
- Use semantic versioning for major changes
- Tag releases that include script updates