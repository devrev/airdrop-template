# AirSync snap-in template

This GitHub repository provides a template with example code to implement an AirSync snap-in,
which imports todo lists, todos and users from a fake example external system into DevRev.

## Usage

1. Press on the green "Use this template" button, then "Create a new repository"
2. Name the repository in the form `airdrop-<external-system-name>-snap-in`, e.g
`airdrop-github-snap-in` (otherwise you will have to edit the snap-in manifest and a few other files).
3. Create the repository

A new repository will be created, with some data already populated by the template, assuming you set
the name, according to Step 2 above.

## Additional info

While developing the AirSync snap-in, make sure to refer to the
[AirSync snap-in documentation](https://developer.devrev.ai/airsync).

## Local Fixture Testing

From the `code/` directory, you can run the built-in fixture runner to test the
template locally:

```bash
npm start -- --fixturePath start_extracting_external_sync_units
npm start -- --fixturePath start_extracting_data
npm start -- --fixturePath start_extracting_data_selective
npm start -- --fixturePath start_loading_data
```

The runner reads `code/.env` and resolves `${TODO_API_KEY}` in fixture files,
so copy `code/.env.example` before running the fixtures.
