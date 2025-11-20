# Context7 Topic: Mapping & Metadata Playbook

Fetch this doc via Context7 (`topic="mapping-playbook"`) whenever you need a refresher on generating `external_domain_metadata.json`, `initial_domain_mapping.json`, or using the AirSync MCP tools.

---

## 1. Workflow Overview

| Step | Command/Action | Notes |
| --- | --- | --- |
| Generate metadata | Manually edit `external_domain_metadata.json` to describe external record types (fields, types, references). | Keep it generic; this file mirrors the external schema. |
| Map record types | Use `AirSync.map_record_type` (MCP) to pair each external type with a DevRev leaf type (`issue`, `devu`, `comment`, etc.). | Set `as_default=true` unless multiple mappings exist. |
| Map fields | For each DevRev field, run `AirSync.get_field_options` → choose an option → `AirSync.map_field`. | Include fallbacks for required DevRev fields. |
| Validate | `AirSync.use_mapping` to ensure all record types are mapped and required DevRev fields are satisfied. | Resolve any deficiencies before shipping. |

---

## 2. Metadata Tips

- **Field Types**: Use `text`, `rich_text`, `number`, `boolean`, `reference`, or `enum`.  
- **References**: For cross-entity relationships, set `"type": "reference"` with `"refers_to": { "#record:users": {} }`.  
- **Artifacts**: If you only capture IDs/URLs, treat them as attachments with `text` fields.  
- **Comments**: Represent them as their own record type (body, author, parent reference).  
- **Incremental fields**: Include timestamps (`created_at`, `updated_at`) so they can be mapped if needed.

Example snippet:
```json
"features": {
  "name": "Features",
  "fields": {
    "title": { "type": "text", "is_required": true },
    "description": { "type": "rich_text" },
    "assigned_to_user_id": {
      "type": "reference",
      "reference": { "refers_to": { "#record:users": {} } }
    }
  }
}
```

---

## 3. Mapping Commands

```bash
# Map record type to DevRev leaf
AirSync.map_record_type \
  --record_type features \
  --leaf_type issue \
  --mapping_file code/src/.../initial_domain_mapping.json

# List field options
AirSync.get_field_options \
  --record_type features \
  --leaf_type issue \
  --devrev_fields title body

# Map a specific field
AirSync.map_field \
  --record_type features \
  --leaf_type issue \
  --devrev_field title \
  --option_key title/use_directly/

# Validate
AirSync.use_mapping \
  --metadata_file code/src/.../external_domain_metadata.json \
  --mapping_file code/src/.../initial_domain_mapping.json
```

(Adjust CLI syntax to your MCP client; the key parameters are the same.)

---

## 4. Common Pitfalls

| Issue | Fix |
| --- | --- |
| Required DevRev field missing | Use `get_field_options` to see available transformations; choose a direct mapping or set a fallback. |
| Enum mismatch | Use `use_fixed_value` or `use_raw_jq` to convert external enums to DevRev allowed values. |
| Reference type mismatch | Ensure metadata marks the field as `"type": "reference"` so mapping options include `use_devrev_record`. |
| Attachment artifacts missing IDs | Normalize attachments with stable IDs (e.g., combine parent ID + attachment ID) so DevRev artifacts remain unique. |

---

## 5. Best Practices

- **Versioning**: Store `schema_version`/`format_version` fields in both JSONs so future upgrades are easier.  
- **Reusability**: Keep metadata generic; avoid external-specific naming in DevRev field descriptions.  
- **Validation cadence**: Run `AirSync.use_mapping` after every structural change to catch regressions immediately.  
- **Documentation**: Annotate the mapping JSON with comments (if allowed) or maintain a `MAPPING_NOTES.md` summarizing key decisions (e.g., “all features map `created_by_id` from `created_by_user_id`”).

---

Use this playbook to keep metadata/mapping tasks lightweight. Pull it via Context7 when you need the command syntax or quick references, keeping the main prompt focused on coding.***
