import { ExternalSystemItem } from '@devrev/ts-adaas';
import { ExternalTodo } from './types';

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
