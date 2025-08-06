// Custom system data types based on the structures returned by HttpClient

export interface CustomTodoList {
  id: string;
  name: string;
  description: string;
  item_count: number;
  item_type: string;
}

export interface CustomTodo {
  id: string;
  created_date: string;
  modified_date: string;
  body: string;
  creator: string;
  owner: string;
  title: string;
}

export interface CustomUser {
  id: string;
  created_date: string;
  modified_date: string;
  email: string;
  name: string;
}

export interface CustomAttachment {
  url: string;
  id: string;
  file_name: string;
  author_id?: string;
  parent_id: string;
}