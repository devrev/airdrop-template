# ADaaS Template

This GitHub repository provides a template with example code to implement an Airdrop as a Service (ADaaS) snap-in.

## Prerequisites

- [DevRev CLI](https://developer.devrev.ai/snapin-development/references/cli-install)
- [Node.js](https://nodejs.org/en/download/package-manager)
- [jq](https://jqlang.github.io/jq/download/)

## Build, deploy, and run

1. Create a new repository:
   - Create a new repository from this template by clicking the "Use this template" button in the
     upper right corner and then "Create a new repository"
   - The repository name must start with `airdrop-` (e.g., `airdrop-<external system>-snap-in`)
2. Open the project in your IDE and set up project environment variables by following these steps:
   - Rename `.env.example` to `.env`
   - In `.env` set the slug of your organization, and your email
3. Build the snap-in using `make build`
4. Deploy the snap-in to the organization using `make deploy`

   NOTE: This process may take some time.
   The command authenticates you to the org using the DevRev CLI,
   creates a snap-in package, its snap-in version, and finally the snap-in draft.

5. After the Snap-in draft is created, install the snap-in in the DevRev UI
   Settings -> Snap-ins -> Click tab Installed -> Find your snap-in and click on it -> Click Configure in the upper right corner -> Install snap-in
6. Start the import (Settings -> Airdrops -> Click Airdrop button in the upper right corner -> <your Snap-in>)

For more information about Airdrop as a Service (ADaaS) development or to see some frequently asked
questions, see our [documentation](https://developer.devrev.ai/public/snapin-development/adaas).
