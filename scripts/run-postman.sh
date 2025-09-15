#!/bin/bash

# Postman collection runner script
# This script runs the Postman collection tests using Newman

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[POSTMAN]${NC} $1"
}

# Check if Newman is installed
if ! command -v newman &> /dev/null; then
    print_error "Newman is not installed. Please install it with: npm install -g newman"
    exit 1
fi

# Check if collection file exists
if [ ! -f "postman/collection.json" ]; then
    print_error "Postman collection file not found at postman/collection.json"
    exit 1
fi

# Check if environment file exists
if [ ! -f "postman/environment.json" ]; then
    print_error "Postman environment file not found at postman/environment.json"
    exit 1
fi

# Default values
API_BASE_URL=${API_BASE_URL:-"http://localhost:4000"}
COLLECTION_FILE="postman/collection.json"
ENVIRONMENT_FILE="postman/environment.json"
REPORT_DIR="postman/reports"
TIMEOUT=${TIMEOUT:-30000}

# Create reports directory
mkdir -p "$REPORT_DIR"

# Generate timestamp for report files
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="$REPORT_DIR/newman_report_$TIMESTAMP"

print_header "Starting Postman collection tests"
print_status "API Base URL: $API_BASE_URL"
print_status "Collection: $COLLECTION_FILE"
print_status "Environment: $ENVIRONMENT_FILE"
print_status "Report Directory: $REPORT_DIR"

# Check if API server is running
print_status "Checking if API server is running..."
if ! curl -s "$API_BASE_URL/health" > /dev/null; then
    print_error "API server is not running at $API_BASE_URL"
    print_warning "Please start the server with: npm run dev"
    exit 1
fi

print_status "API server is running ✓"

# Run Newman tests
print_header "Running Postman collection tests..."

newman run "$COLLECTION_FILE" \
    --environment "$ENVIRONMENT_FILE" \
    --env-var "baseUrl=$API_BASE_URL" \
    --timeout-request "$TIMEOUT" \
    --reporters cli,html,json \
    --reporter-html-export "$REPORT_FILE.html" \
    --reporter-json-export "$REPORT_FILE.json" \
    --reporter-cli-no-summary \
    --reporter-cli-no-banner \
    --reporter-cli-no-console \
    --bail

# Check exit code
if [ $? -eq 0 ]; then
    print_status "All tests passed! ✓"
    print_status "HTML Report: $REPORT_FILE.html"
    print_status "JSON Report: $REPORT_FILE.json"
    
    # Open HTML report if on macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        print_status "Opening HTML report..."
        open "$REPORT_FILE.html"
    fi
else
    print_error "Some tests failed! ✗"
    print_status "Check the reports for details:"
    print_status "HTML Report: $REPORT_FILE.html"
    print_status "JSON Report: $REPORT_FILE.json"
    exit 1
fi
