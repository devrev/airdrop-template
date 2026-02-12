#!/bin/bash

# Minimal colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

error() { echo -e "${RED}ERROR: $1${NC}"; }
success() { echo -e "${GREEN}SUCCESS: $1${NC}"; }

# Find project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODE_DIR="$(dirname "$SCRIPT_DIR")"

# Check prerequisites
if ! command -v devrev &> /dev/null; then
    error "devrev CLI is not installed"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    error "jq is not installed"
    exit 1
fi

# Load .env from code/
ENV_FILE="$CODE_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
else
    error ".env file not found at $ENV_FILE"
    exit 1
fi

if [ -z "$DEV_ORG" ] || [ -z "$USER_EMAIL" ]; then
    error "DEV_ORG and USER_EMAIL must be set in .env"
    exit 1
fi

# Default to prod environment
DEVREV_ENV="${ENV:-prod}"

# Authenticate
echo "Authenticating as $USER_EMAIL into $DEV_ORG ($DEVREV_ENV)..."
devrev profiles authenticate --env "$DEVREV_ENV" --usr "$USER_EMAIL" --org "$DEV_ORG" --expiry 5

if [ $? -ne 0 ]; then
    error "DevRev authentication failed"
    exit 1
fi

echo "Cleaning up snap-in packages and versions..."
echo ""

# Get all packages (JSONL format)
PACKAGES=$(devrev snap_in_package list 2>&1 | grep -v "listing")

if [ -z "$PACKAGES" ]; then
    echo "No snap-in packages found"
    exit 0
fi

# Convert JSONL to JSON array
PACKAGES_ARRAY=$(echo "$PACKAGES" | jq -s '.' 2>/dev/null)
PACKAGE_COUNT=$(echo "$PACKAGES_ARRAY" | jq 'length' 2>/dev/null)

if [ -z "$PACKAGE_COUNT" ] || [ "$PACKAGE_COUNT" == "0" ]; then
    echo "No snap-in packages found"
    exit 0
fi

echo "Found $PACKAGE_COUNT package(s)"
echo ""

# Process each package
PACKAGE_INDEX=0
while true; do
    PACKAGE_ID=$(echo "$PACKAGES_ARRAY" | jq -r ".[$PACKAGE_INDEX].id" 2>/dev/null)
    
    if [ -z "$PACKAGE_ID" ] || [ "$PACKAGE_ID" == "null" ]; then
        break
    fi
    
    echo "Package: $PACKAGE_ID"
    
    # Get versions for this package
    VERSIONS=$(devrev snap_in_version list --package "$PACKAGE_ID" 2>&1 | grep -v "listing")
    
    if [ -n "$VERSIONS" ]; then
        VERSIONS_ARRAY=$(echo "$VERSIONS" | jq -s '.' 2>/dev/null)
        VERSION_COUNT=$(echo "$VERSIONS_ARRAY" | jq 'length' 2>/dev/null)
        
        if [ -n "$VERSION_COUNT" ] && [ "$VERSION_COUNT" != "0" ]; then
            VERSION_INDEX=0
            while true; do
                VERSION_ID=$(echo "$VERSIONS_ARRAY" | jq -r ".[$VERSION_INDEX].id" 2>/dev/null)
                
                if [ -z "$VERSION_ID" ] || [ "$VERSION_ID" == "null" ]; then
                    break
                fi
                
                echo "  Deleting version: $VERSION_ID"
                if devrev snap_in_version delete-one "$VERSION_ID" > /dev/null 2>&1; then
                    success "  Deleted version"
                else
                    error "  Failed to delete version"
                fi
                
                VERSION_INDEX=$((VERSION_INDEX + 1))
            done
        fi
    fi
    
    echo "  Deleting package: $PACKAGE_ID"
    if devrev snap_in_package delete-one "$PACKAGE_ID" > /dev/null 2>&1; then
        success "  Deleted package"
    else
        error "  Failed to delete package"
    fi
    
    echo ""
    PACKAGE_INDEX=$((PACKAGE_INDEX + 1))
done

success "Cleanup complete!"
