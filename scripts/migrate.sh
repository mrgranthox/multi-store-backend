#!/bin/bash

# Migration script for the multi-store e-commerce backend
# This script handles database migrations for both development and production

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check if .env file exists
if [ ! -f .env ]; then
    print_error ".env file not found. Please copy env.example to .env and configure your database settings."
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    print_error "DATABASE_URL is not set in .env file"
    exit 1
fi

# Function to run Prisma migrations
run_migrations() {
    print_status "Running Prisma migrations..."
    
    if [ "$NODE_ENV" = "production" ]; then
        print_status "Running production migration (deploy mode)..."
        npx prisma migrate deploy
    else
        print_status "Running development migration..."
        npx prisma migrate dev
    fi
}

# Function to generate Prisma client
generate_client() {
    print_status "Generating Prisma client..."
    npx prisma generate
}

# Function to reset database (development only)
reset_database() {
    if [ "$NODE_ENV" = "production" ]; then
        print_error "Cannot reset database in production environment"
        exit 1
    fi
    
    print_warning "This will reset the database and lose all data. Are you sure? (y/N)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        print_status "Resetting database..."
        npx prisma migrate reset --force
    else
        print_status "Database reset cancelled"
    fi
}

# Function to show migration status
show_status() {
    print_status "Checking migration status..."
    npx prisma migrate status
}

# Main script logic
case "${1:-migrate}" in
    "migrate")
        run_migrations
        generate_client
        print_status "Migration completed successfully!"
        ;;
    "reset")
        reset_database
        ;;
    "status")
        show_status
        ;;
    "generate")
        generate_client
        print_status "Prisma client generated successfully!"
        ;;
    "deploy")
        NODE_ENV=production run_migrations
        generate_client
        print_status "Production migration completed successfully!"
        ;;
    *)
        echo "Usage: $0 {migrate|reset|status|generate|deploy}"
        echo ""
        echo "Commands:"
        echo "  migrate  - Run migrations in development mode (default)"
        echo "  reset    - Reset database (development only)"
        echo "  status   - Show migration status"
        echo "  generate - Generate Prisma client only"
        echo "  deploy   - Run migrations in production mode"
        exit 1
        ;;
esac
