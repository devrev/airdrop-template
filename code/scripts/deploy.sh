#!/usr/bin/env bash

echo "Creating Snap-in version..."

# Create a new snap-in version
VER_OUTPUT=$(devrev snap_in_version create-one \
  --path "." \
  --create-package | tee /dev/tty)

# Filter the output to get the snap-in version ID
FILTERED_OUTPUT=$(grep "snap_in_version" <<<"$VER_OUTPUT" | grep -o '{.*}')

# Check if DevRev CLI returned an error (error messages contain the field 'message')
if ! jq '.message' <<<"$FILTERED_OUTPUT" | grep null >/dev/null; then
  exit 1
fi

# Get the snap-in version ID
VERSION_ID=$(jq -r '.snap_in_version.id' <<<"$FILTERED_OUTPUT")

echo "Waiting 10 seconds for Snap-in version to be ready..."
sleep 10

# Wait for the snap-in version to be ready
while :; do
  VER_OUTPUT2=$(devrev snap_in_version show "$VERSION_ID")
  STATE=$(jq -r '.snap_in_version.state' <<<"$VER_OUTPUT2")
  if [[ "$STATE" == "build_failed" ]] || [[ "$STATE" == "deployment_failed" ]]; then
    echo "Snap-in version build/deployment failed: $(jq -r '.snap_in_version.failure_reason' <<<"$VER_OUTPUT2")"
    exit 1
  elif [[ "$STATE" == "ready" ]]; then
    break
  else
    echo "Snap-in version's state is $STATE, waiting 10 seconds..."
    sleep 10
  fi
done

echo "Creating Snap-in draft..."

# Create a new snap-in draft
DRAFT_OUTPUT=$(devrev snap_in draft --snap_in_version "$VERSION_ID")
jq <<<"$DRAFT_OUTPUT"
echo "Snap-in draft created. Please go to the Snap-ins page in the DevRev UI to complete the installation process."

# Check if DevRev CLI returned an error (error messages contain the field 'message')
if ! jq '.message' <<<"$DRAFT_OUTPUT" | grep null >/dev/null; then
  exit 1
fi
