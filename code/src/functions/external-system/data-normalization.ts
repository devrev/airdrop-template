import { NormalizedAttachment, NormalizedItem } from '@devrev/ts-adaas';

export function normalizeIssue(item: any): NormalizedItem {
  /* createItemUrl function should return the url of the object in the external system */
  const createItemUrl = (id: string) => `https://external-system.com/issues/${id}`;

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
