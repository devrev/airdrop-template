import { ExternalSystemAttachment, ExternalSystemItem } from '@devrev/ts-adaas';
import { ExternalAttachment, ExternalTodo } from './types';

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

export function denormalizeAttachment(item: ExternalSystemAttachment): ExternalAttachment {
  return {
    id: item.reference_id,
    url: item.url,
    file_name: item.file_name,
    author_id: item.created_by_id,
    parent_id: item.parent_id ?? item.parent_reference_id,
  };
}
