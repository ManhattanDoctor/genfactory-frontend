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
  balances: Record<string, string>;
}
export interface Pagination<T> {
  items: T[];
  total: number;
  pageIndex: number;
  pageSize: number;
  pages: number;
}
export interface TaskCost {
  status: 'FINAL' | 'PENDING' | 'UNAVAILABLE';
  amounts: { coinId: string; amount: string }[];
  pending?: { operationId: string }[];
}
export interface ImageResult {
  mime: string;
  source: string;
  width: number;
  height: number;
}
export interface TaskResponse {
  result: ImageResult[] | { externalId: string; fileId: number };
  cost: TaskCost;
}
export interface TaskRequest {
  model: string;
  task: { session: string; prompt: string; fileIds?: number[] };
  options: Record<string, unknown>;
}
export type JobStatus = 'running' | 'saving' | 'completed' | 'failed' | 'unknown' | 'save_failed';
export interface Generation {
  id: string;
  userId: number;
  kind: MediaKind;
  modelName: string;
  request: TaskRequest;
  createdAt: string;
  status: JobStatus;
  files: GnosisFile[];
  cost?: TaskCost;
  error?: string;
}
