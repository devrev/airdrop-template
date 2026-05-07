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
        read -rp "$prompt [$default]: " result
        echo "${result:-$default}"
    else
        read -rp "$prompt: " result
        echo "$result"
    fi
}

# Multi-select menu with arrow keys + space to toggle + Enter to confirm.
# Arguments: $1=prompt, $2+=options
# Returns: space-separated list of selected indices in SELECTED_INDICES (empty if none).
multi_select_menu() {
    local prompt="$1"
    shift
    local options=("$@")
    local num_options=${#options[@]}
    local cursor=0
    local checked=()
    local i
    for ((i = 0; i < num_options; i++)); do
        checked[i]=0
    done

    echo "$prompt"
    echo "  (↑/↓ to navigate, space to toggle multiple, Enter to confirm current)"

    display_options() {
        for i in "${!options[@]}"; do
            local mark="[ ]"
            [ "${checked[$i]}" -eq 1 ] && mark="[x]"
            if [ $i -eq $cursor ]; then
                echo -e "  ${GREEN}> ${mark} ${options[$i]}${NC}"
            else
                echo "    ${mark} ${options[$i]}"
            fi
        done
    }

    tput civis
    display_options

    while true; do
        local key
        read -rsn1 key
        if [[ $key == $'\x1b' ]]; then
            read -rsn2 key
            case $key in
                '[A') [ $cursor -gt 0 ] && cursor=$((cursor - 1)) ;;
                '[B') [ $cursor -lt $((num_options - 1)) ] && cursor=$((cursor + 1)) ;;
            esac
            tput cuu $num_options
            display_options
        elif [[ $key == " " ]]; then
            if [ "${checked[$cursor]}" -eq 0 ]; then
                checked[$cursor]=1
            else
                checked[$cursor]=0
            fi
            tput cuu $num_options
            display_options
        elif [[ $key == "" ]]; then
            # If nothing was toggled, treat Enter as "select the highlighted row".
            local any_checked=0
            for i in "${!checked[@]}"; do
                [ "${checked[$i]}" -eq 1 ] && any_checked=1
            done
            if [ $any_checked -eq 0 ] && [ $num_options -gt 0 ]; then
                checked[$cursor]=1
            fi
            break
        fi
    done

    tput cnorm

    SELECTED_INDICES=""
    for i in "${!checked[@]}"; do
        if [ "${checked[$i]}" -eq 1 ]; then
            SELECTED_INDICES="$SELECTED_INDICES $i"
        fi
    done
    SELECTED_INDICES="${SELECTED_INDICES# }"
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

if [[ ! "$USER_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
    error "User email is not a valid email address: $USER_EMAIL"
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

# Convert JSONL to JSON array, newest packages first.
PACKAGES_ARRAY=$(echo "$PACKAGES" | jq -s 'sort_by(.created_date) | reverse' 2>/dev/null)
PACKAGE_COUNT=$(echo "$PACKAGES_ARRAY" | jq 'length' 2>/dev/null)

if [ -z "$PACKAGE_COUNT" ] || [ "$PACKAGE_COUNT" == "0" ]; then
    echo "No snap-in packages found"
    exit 0
fi

echo "Found $PACKAGE_COUNT package(s) in $DEV_ORG ($DEVREV_ENV)"
echo ""

# Build one row per package: "<slug>  <YYYY-MM-DD>  (N version(s))".
LABELS=()
LABEL_INDEX=0
while [ $LABEL_INDEX -lt $PACKAGE_COUNT ]; do
    LABEL_SLUG=$(echo "$PACKAGES_ARRAY" | jq -r ".[$LABEL_INDEX].slug // \"(no slug)\"" 2>/dev/null)
    LABEL_ID=$(echo "$PACKAGES_ARRAY" | jq -r ".[$LABEL_INDEX].id" 2>/dev/null)
    LABEL_DATE=$(echo "$PACKAGES_ARRAY" | jq -r ".[$LABEL_INDEX].created_date // \"\"" 2>/dev/null | cut -c1-10)
    LABEL_VER_COUNT=$(devrev snap_in_version list --package "$LABEL_ID" 2>/dev/null | grep -c .)
    LABELS+=("$(printf '%-40s  %s  (%d version(s))' "$LABEL_SLUG" "$LABEL_DATE" "$LABEL_VER_COUNT")")
    LABEL_INDEX=$((LABEL_INDEX + 1))
done

multi_select_menu "Select snap-in package(s) to delete:" "${LABELS[@]}"

if [ -z "$SELECTED_INDICES" ]; then
    echo "No packages selected. Aborted."
    exit 0
fi

# Build a compact slug list for the confirm prompt.
SELECTED_SLUGS=()
for PACKAGE_INDEX in $SELECTED_INDICES; do
    SELECTED_SLUGS+=("$(echo "$PACKAGES_ARRAY" | jq -r ".[$PACKAGE_INDEX].slug // \"(no slug)\"" 2>/dev/null)")
done
SELECTED_COUNT=${#SELECTED_SLUGS[@]}
MAX_SHOWN=5
if [ $SELECTED_COUNT -le $MAX_SHOWN ]; then
    SLUG_DISPLAY=$(IFS=,; echo "${SELECTED_SLUGS[*]}" | sed 's/,/, /g')
else
    SHOWN=("${SELECTED_SLUGS[@]:0:$MAX_SHOWN}")
    REMAINING=$((SELECTED_COUNT - MAX_SHOWN))
    SLUG_DISPLAY=$(IFS=,; echo "${SHOWN[*]}" | sed 's/,/, /g')
    SLUG_DISPLAY="$SLUG_DISPLAY, ... and $REMAINING more"
fi

echo ""
read -r -p "Delete $SELECTED_COUNT package(s): $SLUG_DISPLAY ? [y/N]: " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Aborted."
    exit 0
fi
echo ""

# Process each selected package
for PACKAGE_INDEX in $SELECTED_INDICES; do
    PACKAGE_ID=$(echo "$PACKAGES_ARRAY" | jq -r ".[$PACKAGE_INDEX].id" 2>/dev/null)

    if [ -z "$PACKAGE_ID" ] || [ "$PACKAGE_ID" == "null" ]; then
        continue
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
done

success "Cleanup complete!"
