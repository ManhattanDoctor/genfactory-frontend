export type MediaKind = 'image' | 'video';
export interface Schema {
  type?: string;
  description?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
  additionalProperties?: boolean | Schema;
  allOf?: Schema[];
  anyOf?: Schema[];
  [key: string]: unknown;
}
export interface ModelDescription {
  reference: { provider: string; model: string };
  name: string;
  schema: Schema;
  capabilities?: string[];
}
export interface GnosisFile {
  id: number;
  uid: string;
  name: string;
  path: string;
  type: string;
  mime: string;
  userId: number;
  createdDate: string;
  tags?: string[];
}
export interface InitResponse {
  user: { id: number; preferences?: { name?: string; email?: string; picture?: string } };
  /** Minor units (kopecks/cents), including fractional minor units. */
  balances: Record<string, string>;
}
export interface Pagination<T> {
  items: T[];
  total: number;
  pageIndex: number;
  pageSize: number;
  pages: number;
}
// Used only to validate model inputs against the catalog, never submitted to /task.
export interface TaskRequest {
  model: string;
  task: { session: string; prompt: string; fileIds?: number[] };
  options: Record<string, unknown>;
}
export interface ToolConnection {
  uid: string;
  settings?: { model: ModelDescription['reference']; options?: Record<string, unknown> };
}
export interface Conversation {
  id: number;
  userId: number;
  name: string;
  status: 'LOADED' | 'LOADING' | 'ERROR';
  model: string;
  options: { model: string; tools?: (ToolConnection | string)[]; [key: string]: unknown };
  tags?: string[];
  createdDate: string;
  lastMessageDate?: string;
}
export interface ConversationMessage {
  id: number;
  role: 'USER' | 'ASSISTANT' | 'COMMAND';
  text?: string;
  files?: GnosisFile[];
  createdDate: string;
}
export interface ConversationCreate {
  name: string;
  model: string;
  options: Conversation['options'];
  tags: string[];
  system: string;
  history: number;
  isConsiderHistory: boolean;
}
export interface MessageCreate {
  role: 'USER';
  text: string;
  files: number[];
  settings: { tools: ToolConnection[] };
}

export interface ToolProgress {
  uid: string;
  name?: string;
  status?: 'STARTED' | 'FINISHED' | 'ERRORED';
}
export interface ConversationProgress {
  data?: { tools?: ToolProgress[]; value?: string };
}
