
*This is an instruction file for Claude Code. You may remove it if not using Claude.*

When asked to perform airdrop initial mapping:

-  refer to code/src/functions/external-system/external_domain_metadata.json for the external domain metadata.

- you find the initial mapping file at code/src/functions/external-system/initial_domain_mapping.json.

-  Call 'use_mapping' to test out how the initial mapping behaves on the current metadata.

-  Use MCP tools to manipulate the initial mapping when adding and removing record type mappings, or unmapping fields or mapping simple fields. For more complex field mappings (if map_field reports the method is not yet supported) you may edit the mapping file directly. Refer to the initial_mappings_schema.yaml for its proper format.

    If doing so, always use use_mapping to verify the mapping file is still valid.

- Use get_field_options tool to discover what field mappings are available for the given devrev fields.

- Discuss with the user to clarify the requirements on how they want the external system to be mapped to devrev!