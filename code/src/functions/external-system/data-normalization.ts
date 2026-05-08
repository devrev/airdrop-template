import { ExternalSyncUnit, NormalizedAttachment, NormalizedItem } from '@devrev/ts-adaas';
import { ExternalAttachment, ExternalTodo, ExternalTodoList, ExternalUser } from './types';

export function normalizeTodoList(item: ExternalTodoList): ExternalSyncUnit {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    item_count: item.item_count,
    item_type: item.item_type,
  };
}

export function normalizeTodo(item: ExternalTodo): NormalizedItem {
  const createItemUrl = (id: string) => `https://example.com/todos/${id}`;

  return {
    id: item.id,
    created_date: item.created_date,
    modified_date: item.modified_date,
    data: {
      body: item.body,
      creator: item.creator,
      owner: item.owner,
      title: item.title,
      item_url_field: createItemUrl(item.id),
    },
  };
}

export function normalizeUser(item: ExternalUser): NormalizedItem {
  return {
    id: item.id,
    created_date: item.created_date,
    modified_date: item.modified_date,
    data: {
      email: item.email,
      name: item.name,
    },
  };
}

export function normalizeAttachment(item: ExternalAttachment): NormalizedAttachment {
  return {
    url: item.url,
    id: item.id,
    file_name: item.file_name,
    author_id: item.author_id,
    parent_id: item.parent_id,
  };
}
