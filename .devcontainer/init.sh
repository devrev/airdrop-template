#!/bin/sh
# This script initializes DevRev-specific tools and configuration in the Dev Container.

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

# Only prompt for user information and create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "No .env file found. Creating one..."
    read -p "Enter your email: " USER_EMAIL
    read -p "Enter your DevRev organization slug: " DEV_ORG

    # Create .env file
    cat > .env << EOF
USER_EMAIL=$USER_EMAIL
DEV_ORG=$DEV_ORG
EOF
else
    echo ".env file already exists. Skipping creation."
fi

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

install_chef_cli() {
    # Get the latest version
    echo "Checking latest Chef CLI version..."
    local version=$(
        curl -s https://api.github.com/repos/devrev/adaas-chef-cli/releases/latest \
        | grep -o '"tag_name": "[0-9.]*"' \
        | cut -d'"' -f4
    )

    # Download the latest release (always Linux amd64 since we're in a devcontainer)
    echo "Downloading Chef CLI version ${version}..."
    curl -L \
        "https://github.com/devrev/adaas-chef-cli/releases/download/${version}/chef-cli_${version}_Linux_${ARCH}.tar.gz" \
        -o "$TMP_DIR/chef-cli.tar.gz"

    # Extract the binary
    echo "Extracting Chef CLI..."
    tar -xzf "$TMP_DIR/chef-cli.tar.gz" -C "$TMP_DIR"

    # Create bin directory if it doesn't exist
    mkdir -p "$HOME/bin"

    # Move the binary to bin directory
    mv "$TMP_DIR/chef-cli" "$HOME/bin/"

    # Make it executable
    chmod +x "$HOME/bin/chef-cli"

    # Add to PATH if not already there
    if ! echo "$PATH" | grep -q "$HOME/bin"; then
        echo 'export PATH="$HOME/bin:$PATH"' >> "$HOME/.bashrc"
        export PATH="$HOME/bin:$PATH"
    fi

    echo "Chef CLI installed successfully"
}

# Install additional tools
install_devrev_cli
install_chef_cli

echo "Initialization complete"
