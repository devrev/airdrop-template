import { AirdropEvent, ExternalSystemItemLoadingResponse } from '@devrev/ts-adaas';
import { ExternalAttachment, ExternalTodo, ExternalTodoList, ExternalUser } from './types';

// ---------------------------------------------------------------------------
// In-memory data store
//
// This simulates an external system's database. In a real connector you would
// replace the methods below with actual HTTP calls to your external API.
// ---------------------------------------------------------------------------

const USERS: ExternalUser[] = [
  { id: 'user-1', created_date: '2018-03-10T08:00:00Z', modified_date: '2018-03-10T08:00:00Z', email: 'alice@example.com', name: 'Alice Johnson' },
  { id: 'user-2', created_date: '2019-07-22T14:30:00Z', modified_date: '2019-07-22T14:30:00Z', email: 'bob@example.com', name: 'Bob Smith' },
  { id: 'user-3', created_date: '2020-11-05T09:15:00Z', modified_date: '2021-02-18T11:00:00Z', email: 'carol@example.com', name: 'Carol White' },
  { id: 'user-4', created_date: '2021-04-12T16:45:00Z', modified_date: '2022-08-30T10:20:00Z', email: 'dave@example.com', name: 'Dave Brown' },
  { id: 'user-5', created_date: '2022-09-01T07:00:00Z', modified_date: '2023-01-15T13:00:00Z', email: 'eve@example.com', name: 'Eve Davis' },
  { id: 'user-6', created_date: '2023-03-20T12:00:00Z', modified_date: '2023-06-10T09:30:00Z', email: 'frank@example.com', name: 'Frank Miller' },
  { id: 'user-7', created_date: '2023-10-01T08:00:00Z', modified_date: '2024-01-05T14:00:00Z', email: 'grace@example.com', name: 'Grace Lee' },
  { id: 'user-8', created_date: '2024-02-14T10:00:00Z', modified_date: '2024-05-20T16:00:00Z', email: 'henry@example.com', name: 'Henry Zhang' },
  { id: 'user-9', created_date: '2024-08-01T09:00:00Z', modified_date: '2025-01-10T11:00:00Z', email: 'irene@example.com', name: 'Irene Park' },
  { id: 'user-10', created_date: '2025-03-15T08:30:00Z', modified_date: '2026-01-20T10:00:00Z', email: 'jack@example.com', name: 'Jack Wilson' },
];

const TODO_LISTS: ExternalTodoList[] = [
  { id: 'list-1', name: 'Work Tasks', description: 'Tasks related to work', item_count: 5, item_type: 'todos' },
  { id: 'list-2', name: 'Personal Tasks', description: 'Personal errands and goals', item_count: 5, item_type: 'todos' },
  { id: 'list-3', name: 'Project Tasks', description: 'Tasks for the current project', item_count: 5, item_type: 'todos' },
];

const TODOS: ExternalTodo[] = [
  { id: 'todo-1',  created_date: '2018-06-01T08:00:00Z', modified_date: '2018-06-01T08:00:00Z', title: 'Set up development environment', body: '<p>Install Node.js, configure editor, clone repos.</p>', creator: 'user-1', owner: 'user-1' },
  { id: 'todo-2',  created_date: '2019-09-15T10:00:00Z', modified_date: '2019-09-15T10:00:00Z', title: 'Write project proposal', body: '<p>Draft the initial project proposal document.</p>', creator: 'user-2', owner: 'user-2' },
  { id: 'todo-3',  created_date: '2020-02-20T09:00:00Z', modified_date: '2020-02-20T09:00:00Z', title: 'Design database schema', body: '<p>Define entities, relationships and indexes.</p>', creator: 'user-1', owner: 'user-3' },
  { id: 'todo-4',  created_date: '2021-05-10T14:00:00Z', modified_date: '2021-05-10T14:00:00Z', title: 'Implement authentication', body: '<p>Add JWT-based authentication to the API.</p>', creator: 'user-3', owner: 'user-4' },
  { id: 'todo-5',  created_date: '2022-01-18T11:30:00Z', modified_date: '2022-03-05T16:00:00Z', title: 'Add unit tests', body: '<p>Achieve 80% test coverage for the core module.</p>', creator: 'user-2', owner: 'user-5' },
  { id: 'todo-6',  created_date: '2022-08-22T08:00:00Z', modified_date: '2023-02-14T09:00:00Z', title: 'Performance profiling', body: '<p>Profile API endpoints and fix bottlenecks.</p>', creator: 'user-4', owner: 'user-4' },
  { id: 'todo-7',  created_date: '2023-04-05T10:00:00Z', modified_date: '2023-07-01T13:00:00Z', title: 'Integrate third-party payment provider', body: '<p>Connect Stripe for billing.</p>', creator: 'user-5', owner: 'user-6' },
  { id: 'todo-8',  created_date: '2023-11-01T08:30:00Z', modified_date: '2024-02-10T10:00:00Z', title: 'Migrate to TypeScript', body: '<p>Convert remaining JS files to TypeScript.</p>', creator: 'user-6', owner: 'user-7' },
  { id: 'todo-9',  created_date: '2024-03-12T09:00:00Z', modified_date: '2024-06-20T15:00:00Z', title: 'Implement dark mode', body: '<p>Add dark mode toggle and persist preference.</p>', creator: 'user-7', owner: 'user-8' },
  { id: 'todo-10', created_date: '2024-07-01T11:00:00Z', modified_date: '2024-09-30T12:00:00Z', title: 'Set up CI/CD pipeline', body: '<p>Configure GitHub Actions for build and deploy.</p>', creator: 'user-8', owner: 'user-9' },
  { id: 'todo-11', created_date: '2024-10-15T08:00:00Z', modified_date: '2025-01-08T09:30:00Z', title: 'Refactor API error handling', body: '<p>Standardise error responses across all endpoints.</p>', creator: 'user-9', owner: 'user-10' },
  { id: 'todo-12', created_date: '2025-02-01T10:00:00Z', modified_date: '2025-03-15T11:00:00Z', title: 'Add search functionality', body: '<p>Implement full-text search with filters.</p>', creator: 'user-10', owner: 'user-1' },
  { id: 'todo-13', created_date: '2025-05-20T09:00:00Z', modified_date: '2025-07-10T14:00:00Z', title: 'Optimise database queries', body: '<p>Add missing indexes and rewrite slow queries.</p>', creator: 'user-1', owner: 'user-2' },
  { id: 'todo-14', created_date: '2025-09-01T08:00:00Z', modified_date: '2025-11-20T16:30:00Z', title: 'Write API documentation', body: '<p>Document all public endpoints using OpenAPI spec.</p>', creator: 'user-2', owner: 'user-3' },
  { id: 'todo-15', created_date: '2026-01-10T09:00:00Z', modified_date: '2026-03-01T10:00:00Z', title: 'Launch v2.0', body: '<p>Final QA pass and production deployment.</p>', creator: 'user-3', owner: 'user-4' },
];

const ATTACHMENTS: ExternalAttachment[] = [
  { id: 'att-1', url: 'https://www.devrev.ai/favicon.ico', file_name: 'devrev-icon.ico', author_id: 'user-1', parent_id: 'todo-1' },
  { id: 'att-2', url: 'https://www.devrev.ai/favicon.ico', file_name: 'devrev-icon.ico', author_id: 'user-2', parent_id: 'todo-5' },
];

// ---------------------------------------------------------------------------
// In-memory mutable maps for create/update operations (loading direction)
// ---------------------------------------------------------------------------
const todosStore = new Map<string, ExternalTodo>(TODOS.map((t) => [t.id, { ...t }]));

// ---------------------------------------------------------------------------
// Pagination helper
//
// In a real connector, pagination would be driven by cursor or offset/limit
// parameters on the external API. Here we simulate it with a fixed page size
// so the pattern is visible even though the data fits in a single page.
// ---------------------------------------------------------------------------
const PAGE_SIZE = 5;

function paginate<T>(items: T[]): T[] {
  // Simulate paginated retrieval. In a real connector you would loop here,
  // calling the API with limit/offset (or a cursor) until hasMore is false.
  const result: T[] = [];
  for (let offset = 0; offset < items.length; offset += PAGE_SIZE) {
    const page = items.slice(offset, offset + PAGE_SIZE);
    result.push(...page);
    // In production: if (page.length < PAGE_SIZE) break; // no more pages
  }

  return result;
}

// ---------------------------------------------------------------------------
// HttpClient
// ---------------------------------------------------------------------------

export class HttpClient {
  private apiEndpoint: string;
  private apiToken: string;

  constructor(event: AirdropEvent) {
    // TODO: Replace with the API endpoint of the external system. This is
    // passed through the event payload (e.g. event.payload.connection_data.org_id
    // or a keyring subdomain field).
    this.apiEndpoint = '<REPLACE_WITH_API_ENDPOINT>';

    // TODO: Replace with the API token of the external system. This is passed
    // through the event payload. The configuration for the token is defined in
    // manifest.yaml under keyring_types.
    this.apiToken = event.payload.connection_data.key;
  }

  // TODO: Replace with actual API calls that fetch external sync units (e.g.
  // repos, projects, boards) from the external system.
  async getTodoLists(): Promise<ExternalTodoList[]> {
    return paginate(TODO_LISTS);
  }

  // TODO: Replace with actual API calls that fetch todos from the external system.
  async getTodos(): Promise<ExternalTodo[]> {
    return paginate([...todosStore.values()]);
  }

  // TODO: Replace with actual API calls that fetch users from the external system.
  async getUsers(): Promise<ExternalUser[]> {
    return paginate(USERS);
  }

  // TODO: Replace with actual API calls that fetch attachments from the
  // external system.
  async getAttachments(): Promise<ExternalAttachment[]> {
    return paginate(ATTACHMENTS);
  }

  // TODO: Replace with an actual API call that creates a todo in the external system.
  // The function must return { id } on success or { error } on failure.
  async createTodo(todo: ExternalTodo): Promise<ExternalSystemItemLoadingResponse> {
    const id = `todo-${Date.now()}`;
    todosStore.set(id, { ...todo, id, modified_date: new Date().toISOString() });
    return { id };
  }

  // TODO: Replace with an actual API call that updates a todo in the external system.
  // The function must return { id } on success or { error } on failure.
  async updateTodo(todo: ExternalTodo): Promise<ExternalSystemItemLoadingResponse> {
    if (!todosStore.has(todo.id)) {
      return { error: `Todo with id "${todo.id}" not found in external system.` };
    }
    todosStore.set(todo.id, { ...todo, modified_date: new Date().toISOString() });
    return { id: todo.id };
  }

  // TODO: Replace with an actual API call that creates an attachment in the external system.
  // The function must return { id } on success or { error } on failure.
  async createAttachment(attachment: ExternalAttachment): Promise<ExternalSystemItemLoadingResponse> {
    return { id: attachment.id };
  }
}
