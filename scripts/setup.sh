#!/bin/bash

# Multi-Store E-commerce Backend Setup Script
# This script sets up the complete development environment

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
    echo -e "${BLUE}[SETUP]${NC} $1"
}

print_header "Multi-Store E-commerce Backend Setup"
echo "=============================================="

# Check if Node.js is installed
print_status "Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version 18+ is required. Current version: $(node --version)"
    exit 1
fi

print_status "Node.js $(node --version) ✓"

# Check if Docker is installed
print_status "Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    print_warning "Docker is not installed. You can install it from https://docker.com/"
    print_warning "Docker is required for running PostgreSQL and Redis"
else
    print_status "Docker $(docker --version) ✓"
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_warning "Docker Compose is not installed. You can install it from https://docker.com/"
else
    print_status "Docker Compose $(docker-compose --version) ✓"
fi

# Install dependencies
print_header "Installing dependencies..."
npm install
print_status "Dependencies installed ✓"

# Create environment file
print_header "Setting up environment..."
if [ ! -f .env ]; then
    cp env.example .env
    print_status "Created .env file from template"
    print_warning "Please edit .env file with your configuration"
else
    print_status ".env file already exists"
fi

# Start services with Docker Compose
print_header "Starting services with Docker Compose..."
if command -v docker-compose &> /dev/null; then
    docker-compose up -d postgres redis
    print_status "PostgreSQL and Redis started ✓"
    
    # Wait for services to be ready
    print_status "Waiting for services to be ready..."
    sleep 10
else
    print_warning "Docker Compose not available. Please start PostgreSQL and Redis manually"
fi

# Run database migrations
print_header "Running database migrations..."
npm run migrate
print_status "Database migrations completed ✓"

# Seed database
print_header "Seeding database..."
npm run seed
print_status "Database seeded with sample data ✓"

# Run tests
print_header "Running tests..."
npm test
print_status "Tests completed ✓"

# Build application
print_header "Building application..."
npm run build
print_status "Application built ✓"

print_header "Setup completed successfully! 🎉"
echo ""
echo "Next steps:"
echo "1. Start the development server: npm run dev"
echo "2. API will be available at: http://localhost:4000"
echo "3. Health check: http://localhost:4000/health"
echo "4. Run Postman tests: npm run postman"
echo "5. View API documentation in README.md"
echo ""
echo "Sample users created:"
echo "- admin@example.com (password: password123)"
echo "- manager@example.com (password: password123)"
echo "- customer@example.com (password: password123)"
echo ""
echo "Happy coding! 🚀"
