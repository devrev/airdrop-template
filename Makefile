include .env

# Export values in .env to be used in the shell scripts
export $(shell sed 's/=.*//' .env)

default: build
.PHONY: default

deps:
	cd code && npm ci
.PHONY: deps

build: deps
	cd code && npm run build
.PHONY: build

auth:
    # Expiry time is in days
	devrev profiles authenticate --org $(DEV_ORG) --usr $(USER_EMAIL) --expiry 7
.PHONY: auth

deploy: auth
	./code/scripts/deploy.sh
.PHONY: deploy

# Removes the latest snap-in from the org.
# This is useful when you want to re-deploy the same snap-in to the same org.
uninstall:
	./code/scripts/cleanup.sh
.PHONY: uninstall
