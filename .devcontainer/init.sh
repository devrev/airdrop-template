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

# Get the latest version
echo "Checking latest DevRev CLI version..."
LATEST_VERSION=$(curl -s https://api.github.com/repos/devrev/cli/releases/latest | grep -o '"tag_name": "v[0-9.]*"' | cut -d'"' -f4 | sed 's/^v//')

# Download the latest release
echo "Downloading DevRev CLI version ${LATEST_VERSION}..."
curl -L "https://github.com/devrev/cli/releases/download/v${LATEST_VERSION}/devrev_${LATEST_VERSION}-linux_${ARCH}.deb" -o "$TMP_DIR/devrev.deb"

# Install the deb package
echo "Installing DevRev CLI..."
sudo dpkg -i "$TMP_DIR/devrev.deb" || true
sudo apt-get update && sudo apt-get install -f -y

echo "DevRev CLI installation complete!"
