import { ExternalSystemItem } from '@devrev/ts-adaas';
import { CustomTodo } from './types';

// TODO: Replace with the actual denormalization function for your external
// system. This function should take the normalized object and transform it into
// the format expected by the external system API.
export function denormalizeTodo(item: ExternalSystemItem): CustomTodo {
  return {
    ...item,
    id: item.id.devrev,
    body: item.data.body,
    creator: item.data.creator,
    owner: item.data.owner,
    title: item.data.title,
  };
}
