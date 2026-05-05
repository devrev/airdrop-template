#!/bin/bash
# Script for cleaning up the organization from snap-in packages and versions.

# Minimal colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

error() { echo -e "${RED}ERROR: $1${NC}"; }
success() { echo -e "${GREEN}SUCCESS: $1${NC}"; }

# Prompt with default value
prompt_with_default() {
    local prompt="$1"
    local default="$2"
    local result
    
    if [ -n "$default" ]; then
        read -p "$prompt [$default]: " result
        echo "${result:-$default}"
    else
        read -p "$prompt: " result
        echo "$result"
    fi
}

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

# Load .env from code/ (optional, provides defaults)
ENV_FILE="$CODE_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

# Prompt for credentials (with .env values as defaults)
DEV_ORG=$(prompt_with_default "Enter organization" "$DEV_ORG")
USER_EMAIL=$(prompt_with_default "Enter user email" "$USER_EMAIL")

# Validate required values
if [ -z "$DEV_ORG" ]; then
    error "Organization is required"
    exit 1
fi

if [ -z "$USER_EMAIL" ]; then
    error "User email is required"
    exit 1
fi

# Default to prod environment (can be overridden via ENV in .env)
DEVREV_ENV="${ENV:-prod}"

echo ""
# Skip authenticate if the stored token for this env/org/user is still valid.
EXPIRY_RAW=$(devrev profiles get-token expiry --env "$DEVREV_ENV" --org "$DEV_ORG" --usr "$USER_EMAIL" 2>/dev/null)
EXPIRY_EPOCH=""
if [ -n "$EXPIRY_RAW" ]; then
    EXPIRY_EPOCH=$(date -d "$EXPIRY_RAW" +%s 2>/dev/null \
        || date -j -f "%Y-%m-%d %H:%M:%S.%N %z %Z" "$EXPIRY_RAW" +%s 2>/dev/null \
        || date -j -f "%Y-%m-%d %H:%M:%S" "${EXPIRY_RAW%% +*}" +%s 2>/dev/null)
fi
NOW_EPOCH=$(date +%s)

if [ -n "$EXPIRY_EPOCH" ] && [ "$EXPIRY_EPOCH" -gt "$NOW_EPOCH" ]; then
    success "Already authenticated as $USER_EMAIL into $DEV_ORG ($DEVREV_ENV) — token valid until $EXPIRY_RAW"
else
    echo "Authenticating as $USER_EMAIL into $DEV_ORG ($DEVREV_ENV)..."
    if ! devrev profiles authenticate --env "$DEVREV_ENV" --usr "$USER_EMAIL" --org "$DEV_ORG" --expiry 5; then
        error "DevRev authentication failed"
        exit 1
    fi
    success "Authenticated"
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

# Preview what will be deleted and require explicit confirmation.
echo "The following snap-in package(s) will be deleted from $DEV_ORG ($DEVREV_ENV):"
echo ""
PREVIEW_INDEX=0
while [ $PREVIEW_INDEX -lt $PACKAGE_COUNT ]; do
    PREVIEW_SLUG=$(echo "$PACKAGES_ARRAY" | jq -r ".[$PREVIEW_INDEX].slug // \"(no slug)\"" 2>/dev/null)
    PREVIEW_ID=$(echo "$PACKAGES_ARRAY" | jq -r ".[$PREVIEW_INDEX].id" 2>/dev/null)
    PREVIEW_VER_COUNT=$(devrev snap_in_version list --package "$PREVIEW_ID" 2>/dev/null | grep -c .)
    printf "  %-40s  %s  (%d version(s))\n" "$PREVIEW_SLUG" "$PREVIEW_ID" "$PREVIEW_VER_COUNT"
    PREVIEW_INDEX=$((PREVIEW_INDEX + 1))
done
echo ""
read -r -p "Delete $PACKAGE_COUNT snap-in package(s) and their version(s)? [y/N]: " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Aborted."
    exit 0
fi
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
