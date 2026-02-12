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

3. Create your `.env` file from the example:

```sh
cp .env.example .env
```

4. Edit `.env` with your DevRev organization slug and email:

```ini
DEV_ORG=my-org
USER_EMAIL=my@email.com
```

## Deploy

Run the deployment script:

```sh
npm run deploy
```

This will prompt you to choose:

- **Local** - Deploy with ngrok for development (logs visible in terminal)
- **Lambda** - Deploy to Lambda for production testing

## Cleanup

Remove all snap-in packages and versions from your organization:

```sh
npm run cleanup
```

## Start an Import

After deploying, go to DevRev UI: `AirSync` > `Start AirSync` > `<your snap-in>`
