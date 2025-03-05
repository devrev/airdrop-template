import { ExternalSyncUnit, NormalizedAttachment, NormalizedItem } from '@devrev/ts-adaas';

// TODO: Replace with your actual normalization functions that will be used to
// normalize the data received from the external system. You can modify the
// normalization functions to suit your needs. For example, you might want to
// include additional fields or change the structure of the normalized item.
export function normalizeTodoList(item: any): ExternalSyncUnit {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    item_count: item.item_count,
    item_type: item.item_type,
  };
}

export function normalizeTodo(item: any): NormalizedItem {
  // createItemUrl function returns the url that points to this item in the external system.
  // TODO: Adjust this function to your external system.
  const createItemUrl = (id: string) => `https://external-system.com/todos/${id}`;

  return {
    id: item.id,
    created_date: item.created_date,
    modified_date: item.modified_date,
    data: {
      body: item.body,
      creator: item.creator,
      owner: item.owner,
      title: item.title,
      item_url_field: createItemUrl(item.id), // Url that points to the item in the external system.
    },
  };
}

export function normalizeUser(item: any): NormalizedItem {
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

export function normalizeAttachment(item: any): NormalizedAttachment {
  return {
    url: item.url,
    id: item.id,
    file_name: item.file_name,
    author_id: item.author_id,
    parent_id: item.parent_id,
  };
}
