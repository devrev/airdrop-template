import { AirdropEvent } from '@devrev/ts-adaas';

export class HttpClient {
  private apiEndpoint: string;
  private apiToken: string;

  constructor(event: AirdropEvent) {
    // TODO: Replace with API endpoint of the external system. This is passed through
    // the event payload.
    this.apiEndpoint = '<REPLACE_WITH_API_ENDPOINT>';

    // TODO: Replace with API token of the external system. This is passed
    // through the event payload. Configuration for the token is defined in manifest.yaml.
    this.apiToken = event.payload.connection_data.key;
  }

  // TODO: Replace with the actual function to fetch external sync units from
  // the external system.
  async getTodoLists(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      resolve([
        {
          id: '1',
          name: 'Todo List',
          description: 'This is a todo list',
          item_count: 2,
          item_type: 'todos',
        },
      ]);
    });
  }

  // TODO: Replace with the actual function to fetch list of items from the
  // external system.
  async getTodos(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      resolve([
        {
          id: 'todo-1',
          created_date: '1999-12-25T01:00:03+01:00',
          modified_date: '1999-12-25T01:00:03+01:00',
          body: '<p>This is Todo 1</p>',
          creator: 'user-1',
          owner: 'user-1',
          title: 'Todo 1',
        },
        {
          id: 'todo-2',
          created_date: '1999-12-27T15:31:34+01:00',
          modified_date: '2002-04-09T01:55:31+02:00',
          body: '<p>This is Todo 2</p>',
          creator: 'user-2',
          owner: 'user-2',
          title: 'Todo 2',
        },
      ]);
    });
  }

  // TODO: Replace with the actual function to fetch list of users from the
  // external system.
  async getUsers(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      resolve([
        {
          id: 'user-1',
          created_date: '1999-12-25T01:00:03+01:00',
          modified_date: '1999-12-25T01:00:03+01:00',
          email: 'johndoe@test.com',
          name: 'John Doe',
        },
        {
          id: 'user-2',
          created_date: '1999-12-27T15:31:34+01:00',
          modified_date: '2002-04-09T01:55:31+02:00',
          email: 'janedoe@test.com',
          name: 'Jane Doe',
        },
      ]);
    });
  }

  // TODO: Replace with the actual function to fetch list of attachments from
  // the external system.
  async getAttachments(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      resolve([
        {
          url: 'https://app.devrev.ai/favicon.ico',
          id: 'attachment-1',
          file_name: 'favicon1.ico',
          author_id: 'user-1',
          parent_id: 'todo-1',
        },
        {
          url: 'https://app.devrev.ai/favicon.ico',
          id: 'attachment-2',
          file_name: 'favicon2.ico',
          author_id: 'user-2',
          parent_id: 'todo-2',
        },
      ]);
    });
  }

  // TODO: Replace with the actual function to create an item in the external system.
  async createTodo(todo: any): Promise<any> {
    return { error: 'Could not create todo in external system.' };
  }

  // TODO: Replace with the actual function to update an item in the external system.
  async updateTodo(todo: any): Promise<any> {
    return { error: 'Could not update todo in external system.' };
  }

  // TODO: Replace with the actual function to create an attachment in the external system.
  async createAttachment(attachment: any): Promise<any> {
    return { error: 'Could not create attachment in external system.' };
  }
}
