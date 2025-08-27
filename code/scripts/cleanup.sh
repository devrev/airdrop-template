#!/usr/bin/env bash

# Get all snap-in packages
PACKAGES="$(devrev snap_in_package list)"
if [ -z "$PACKAGES" ]; then
    echo "No snap-in packages found"
    exit 0
fi

# Get the first snap-in package ID
PACKAGE_ID="$(jq -csr '.[0].id' <<< "$PACKAGES")"
if [ -z "$PACKAGE_ID" ]; then
    echo "Failed to get snap-in package ID"
    exit 1
fi

# Get all snap-in versions for the first package
VERSIONS="$(devrev snap_in_version list --package "$PACKAGE_ID")"
if [ -z "$VERSIONS" ]; then
    echo "No snap-in versions found"
else
    # Get the first snap-in version ID
    VERSION_ID="$(jq -csr '.[0].id' <<< "$VERSIONS")"
    if [ -n "${VERSION_ID}" ]; then
        echo "Deleting snap-in version ${VERSION_ID}"

        devrev snap_in_version delete-one "${VERSION_ID}" || exit 1
    fi
fi

echo "Deleting snap-in package ${PACKAGE_ID}"

devrev snap_in_package delete-one "${PACKAGE_ID}"
