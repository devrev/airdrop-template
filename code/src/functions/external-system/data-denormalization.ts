import { ExternalSystemAttachment, ExternalSystemItem } from '@devrev/ts-adaas';
import { ExternalAttachment, ExternalTodo } from './types';

// TODO: Replace with the actual denormalization function for your external
// system. This function should take the normalized object and transform it into
// the format expected by the external system API.
export function denormalizeTodo(item: ExternalSystemItem): ExternalTodo {
  return {
    id: item.id.devrev,
    body: item.data.body,
    creator: item.data.creator,
    owner: item.data.owner,
    title: item.data.title,
    created_date: item.created_date,
    modified_date: item.modified_date,
  };
}

// TODO: Replace with the actual denormalization function for attachments.
// Maps the normalized ExternalSystemAttachment (as received from the loading
// pipeline) back into the format expected by the external system API.
export function denormalizeAttachment(item: ExternalSystemAttachment): ExternalAttachment {
  return {
    id: item.reference_id,
    url: item.url,
    file_name: item.file_name,
    author_id: item.created_by_id,
    parent_id: item.parent_id ?? item.parent_reference_id,
  };
}
