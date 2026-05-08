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

# Multi-select menu. Space toggles [x] on the highlighted row; Enter confirms.
# If Enter is pressed with nothing toggled, the highlighted row is used.
# Arguments: $1=prompt, $2+=options
# Returns: space-separated list of selected indices in SELECTED_INDICES.
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
    echo "  Enter: delete marked (or highlighted if none)   Space: toggle   ↑↓: navigate"

    display_options() {
        for i in "${!options[@]}"; do
            local mark="    "
            [ "${checked[$i]}" -eq 1 ] && mark="[x] "
            if [ $i -eq $cursor ]; then
                echo -e "  ${GREEN}> ${mark}${options[$i]}${NC}"
            else
                echo "    ${mark}${options[$i]}"
            fi
        done
    }

    tput civis
    display_options

    while true; do
        local key
        # IFS= prevents `read` from stripping the space character (default IFS includes it),
        # which would otherwise turn a Space keystroke into an empty string and match Enter.
        IFS= read -rsn1 key
        if [[ $key == $'\x1b' ]]; then
            IFS= read -rsn2 key
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

# Normalize `devrev ... list` output into a JSON array, regardless of whether
# the CLI emits JSONL (one object per line) or a single JSON array.
normalize_list() {
    jq -s 'map(if type == "array" then .[] else . end)'
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

PACKAGES_ARRAY=$(devrev snap_in_package list 2>/dev/null | normalize_list | jq 'sort_by(.created_date) | reverse')
PACKAGE_COUNT=$(echo "$PACKAGES_ARRAY" | jq 'length')

if [ -z "$PACKAGE_COUNT" ] || [ "$PACKAGE_COUNT" == "0" ]; then
    echo "No snap-in packages found"
    exit 0
fi

echo "Found $PACKAGE_COUNT package(s) in $DEV_ORG ($DEVREV_ENV)"
echo ""

# One jq pass: emit "<slug>\t<YYYY-MM-DD>" per package.
LABELS=()
while IFS=$'\t' read -r PKG_SLUG PKG_DATE; do
    LABELS+=("$(printf '%-40s  %s' "$PKG_SLUG" "$PKG_DATE")")
done < <(echo "$PACKAGES_ARRAY" | jq -r '.[] | [(.slug // "(no slug)"), ((.created_date // "") | .[0:10])] | @tsv')

multi_select_menu "Select snap-in package(s) to delete:" "${LABELS[@]}"

if [ -z "$SELECTED_INDICES" ]; then
    echo "No packages selected. Aborted."
    exit 0
fi

SELECTED_SLUGS=()
for PACKAGE_INDEX in $SELECTED_INDICES; do
    SELECTED_SLUGS+=("$(echo "$PACKAGES_ARRAY" | jq -r ".[$PACKAGE_INDEX].slug // \"(no slug)\"")")
done
SELECTED_COUNT=${#SELECTED_SLUGS[@]}
SLUG_DISPLAY=$(IFS=, ; echo "${SELECTED_SLUGS[*]}" | sed 's/,/, /g')

echo ""
read -r -p "Delete $SELECTED_COUNT package(s): $SLUG_DISPLAY ? [y/N]: " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Aborted."
    exit 0
fi
echo ""

# Run `devrev ... delete-one` quietly, but surface full CLI output on failure.
run_delete() {
    local label="$1"
    shift
    local output
    if output=$("$@" 2>&1); then
        success "Deleted $label"
    else
        error "Failed to delete $label"
        echo "$output" | sed 's/^/    /'
    fi
}

for PACKAGE_INDEX in $SELECTED_INDICES; do
    PACKAGE_ID=$(echo "$PACKAGES_ARRAY" | jq -r ".[$PACKAGE_INDEX].id")

    if [ -z "$PACKAGE_ID" ] || [ "$PACKAGE_ID" == "null" ]; then
        continue
    fi

    echo "Package: $PACKAGE_ID"

    # Delete versions first: `snap_in_package delete-one` fails while versions still reference it.
    while read -r VERSION_ID; do
        [ -z "$VERSION_ID" ] && continue
        echo "  Deleting version: $VERSION_ID"
        run_delete "version $VERSION_ID" devrev snap_in_version delete-one "$VERSION_ID"
    done < <(devrev snap_in_version list --package "$PACKAGE_ID" 2>/dev/null | normalize_list | jq -r '.[].id')

    echo "  Deleting package: $PACKAGE_ID"
    run_delete "package $PACKAGE_ID" devrev snap_in_package delete-one "$PACKAGE_ID"

    echo ""
done

success "Cleanup complete!"
