# AirSync Todo snap-in

Syncs data between Todo and DevRev using DevRev's AirSync platform.

## Prerequisites

Install the following tools:

- [Node.js](https://nodejs.org/en/download/)
- [DevRev CLI](https://developer.devrev.ai/snapin-development/references/cli-install)
- [jq](https://jqlang.github.io/jq/download/)
- [ngrok](https://ngrok.com/download) (for local development)

## Setup

1. Navigate to the `code` directory:

```sh
cd code
```

2. Install dependencies:

```sh
npm ci
```

3. (Optional) Create a `.env` file to set default values for the prompts:

```sh
cp .env.example .env
```

Edit `.env` with your DevRev organization slug and email:

```ini
DEV_ORG=my-org
USER_EMAIL=my@email.com
```

These values will be used as defaults when the scripts prompt you for credentials.

## Deploy

Run the deployment script:

```sh
npm run deploy
```

The script will prompt you for:

1. **Deployment mode**: Local (ngrok) or Lambda
2. **Organization**: Your DevRev org slug (defaults to `.env` value if set)
3. **Email**: Your DevRev email (defaults to `.env` value if set)

## Cleanup

Remove all snap-in packages and versions from your organization:

```sh
npm run cleanup
```

The script will prompt you for organization and email credentials.

## Start an Import

After deploying, go to DevRev UI: `AirSync` > `Start AirSync` > `<your snap-in>`
