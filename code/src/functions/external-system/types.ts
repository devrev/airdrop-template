// Custom system data types based on the structures returned by HttpClient

export interface ExternalTodoList {
  id: string;
  name: string;
  description: string;
  item_count: number;
  item_type: string;
}

export interface ExternalTodo {
  id: string;
  created_date: string;
  modified_date: string;
  body: string;
  creator: string;
  owner: string;
  title: string;
}

export interface ExternalUser {
  id: string;
  created_date: string;
  modified_date: string;
  email: string;
  name: string;
}

export interface ExternalAttachment {
  url: string;
  id: string;
  file_name: string;
  author_id?: string;
  parent_id: string;
}