# Airdrop Todo snap-in

The Airdrop Todo snap-in syncs data between Todo and DevRev using DevRev's Airdrop platform.

## Prerequisites

<!--
The repository you just opened can be used in two ways, the easy way is through the use of
[Dev Containers](https://containers.dev/) (which require Docker), or by manually installing all
the required tools.
See below on how to use the repository in either way.

### Using Dev Containers

The repository contains configuration for running in a [Dev Container](https://containers.dev/),
which is the recommended way to develop Airdrop snap-ins, as it contains all the tools you will
need and doesn't require you to install anything.

Just install the
[VSCode Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
(JetBrains IDEs already have their Dev Containers extension pre-installed) and open the project.
The IDE should pick up that the configuration exists and offer to reopen the project in a Dev Container.

If you're using Dev Containers, then run all the commands mentioned in this README from within VSCode (inside the
Dev Container).

### Manual Setup
-->

Install the following tools:

- [DevRev CLI](https://developer.devrev.ai/snapin-development/references/cli-install)
- [jq](https://jqlang.github.io/jq/download/)
- [Node.js](https://nodejs.org/en/download/)
- [ngrok](https://ngrok.com/download)

Set your DevRev organization slug (the part after `app.devrev.ai/` in your DevRev URL)
and your email in the `.env` file:

```ini
DEV_ORG=my-org
USER_EMAIL=my@email.com
```

## Getting Started

After installing the prerequisites above <!-- or opening the project in a Dev Container, -->
you can start developing the snap-in.
Run the following code from the `code` directory:

##### 1. Authenticate to your DevRev organization using the DevRev CLI

```sh
devrev profiles authenticate --usr <your email> --org <your DevRev organization slug>
```

##### 2. Install NPM dependencies

```sh
npm ci
```

##### 3. Start the snap-in development server

```sh
npm run test:server -- local
```

##### 4. Start the ngrok tunnel in a separate terminal window <!-- (inside VSCode)-->

For this step, you will need to [create a ngrok account](https://dashboard.ngrok.com/signup).

```sh
ngrok http 8000
```

This will create a tunnel to your local server.
The ngrok forwarding URL will be displayed in the terminal window.

##### 5. Create a new snap-in version and package in a separate terminal window <!-- (inside VSCode) -->

Copy the ngrok 'Forwarding' URL from the previous step (the one ending with `ngrok-free.app`).

```sh
devrev snap_in_version create-one  --manifest ./manifest.yaml --create-package --testing-url <ngrok forwarding URL>
```

##### 6. Create a snap-in draft

```sh
devrev snap_in draft
```

##### 7. Install the snap-in

You can install it in the DevRev UI by going to `Settings` -> `Snap-ins` ->
`Installed` -> `<your snap-in>` -> `Install snap-in` or using the following command:

```sh
devrev snap_in activate
```

##### 8. Start the import

In the DevRev UI, go to `Airdrops` -> `Start Airdrop` -> `<your snap-in>` and start the import.
