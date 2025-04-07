#!/bin/sh
set -e

# Determine architecture
ARCH=$(uname -m)
case "$ARCH" in
    x86_64) ARCH="amd64" ;;
    aarch64) ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

# Create temporary directory
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# Prompt for user information
read -p "Enter your email: " USER_EMAIL
read -p "Enter your DevRev organization slug: " DEV_ORG

# Create .env file
cat > .env << EOF
USER_EMAIL=$USER_EMAIL
DEV_ORG=$DEV_ORG
EOF

install_devrev_cli() {
    # Get the latest version
    echo "Checking latest DevRev CLI version..."
    local version=$(
        curl -s https://api.github.com/repos/devrev/cli/releases/latest \
        | grep -o '"tag_name": "v[0-9.]*"' \
        | cut -d'"' -f4 \
        | sed 's/^v//'
    )

    # Download the latest release
    echo "Downloading DevRev CLI version ${version}..."
    curl -L \
        "https://github.com/devrev/cli/releases/download/v${version}/devrev_${version}-linux_${ARCH}.deb" \
        -o "$TMP_DIR/devrev.deb"

    # Install the deb package
    echo "Installing DevRev CLI..."
    sudo dpkg -i "$TMP_DIR/devrev.deb" || true
    sudo apt-get update && sudo apt-get install -f -y
}

# Install additional tools
install_devrev_cli

echo "Initialization complete"
