export type MediaKind = 'image' | 'video';
export interface ISchema {
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
  properties?: Record<string, ISchema>;
  items?: ISchema;
  required?: string[];
  additionalProperties?: boolean | ISchema;
  allOf?: ISchema[];
  anyOf?: ISchema[];
  [key: string]: unknown;
}
export interface IModelDescription {
  id?: number;
  status?: 'ACTIVE' | 'HIDDEN' | 'DISABLED';
  sortOrder?: number;
  reference: { provider: string; model: string };
  name: string;
  schema: ISchema;
  capabilities?: string[];
}
export interface IPreviewMedia {
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  url?: string;
  mime?: string;
  width?: number;
  height?: number;
  size?: number;
  duration?: number;
}
export interface IPreview {
  image?: IPreviewMedia;
  video?: IPreviewMedia;
}
export interface IFileOutputSettings {
  directory?: string | null;
  tags?: string[];
}
export interface IFileGeneration {
  model: IModelDescription['reference'];
  prompt: string;
  options: Record<string, unknown>;
  maskFileId?: number;
}
export interface IGnosisFile {
  origin?: {
    kind: 'UPLOAD' | 'GENERATION' | 'PROCESSING';
    generation?: IFileGeneration;
    operationId?: string;
    sourceFileIds?: number[];
    directoryFallback?: boolean;
  };
  directory?: string | null;
  linkTo?: number;
  size?: number;
  preview?: IPreview;
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
export interface IInitResponse {
  user: { id: number; preferences?: { name?: string; email?: string; picture?: string } };
  /** Minor units (kopecks/cents), including fractional minor units. */
  balances: Record<string, string>;
}
export interface IPagination<T> {
  items: T[];
  total: number;
  pageIndex: number;
  pageSize: number;
  pages: number;
}
// The same model request is validated against the catalog and submitted to /task.
export interface ITaskExecution {
  sourceFileIds?: number[];
  id: string;
  parentTaskId?: string;
  session?: string;
  model: string;
  createdDate: string;
}
export interface ITaskFinished {
  id: string;
  item: ITaskExecution;
  result: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  fileIds?: number[];
  error?: { code: string; message: string };
}
export interface ITaskRequest {
  model: string;
  task: {
    referenceMode?: 'frames' | 'references';
    session?: string;
    prompt?: string;
    fileIds?: number[];
    text?: string;
    file?: number;
  };
  options: Record<string, unknown>;
  isSaveResult?: boolean;
  fileOutput?: IFileOutputSettings;
}
export interface ITaskResponse {
  result: unknown;
  cost: {
    status: 'FINAL' | 'PENDING' | 'UNAVAILABLE';
    amounts: Array<{ amount: string; coinId: string }>;
    pending?: Array<{ operationId: string }>;
  };
  files?: IGnosisFile[];
}
export interface IToolConnection {
  input?: Record<string, unknown>;
  uid: string;
  isRequired?: boolean;
  settings?: {
    model: IModelDescription['reference'];
    options?: Record<string, unknown>;
    isLockSelection?: boolean;
  };
}
export interface IToolDescription {
  uid: string;
  name?: string;
  isDeprecated?: boolean;
  providers?: string[];
}
export interface IConversation {
  history?: number;
  isConsiderHistory?: boolean;
  historyResetDate?: string | null;
  isFavorite?: boolean;
  isArchived?: boolean;
  previewFileId?: number;
  previewMode?: 'AUTO' | 'MANUAL' | 'NONE';
  fileOutput?: IFileOutputSettings;
  preview?: IPreview;
  id: number;
  userId: number;
  name: string;
  status: 'LOADED' | 'LOADING' | 'ERROR';
  error?: { code: string; message: string };
  model: string;
  options: { model: string; tools?: (IToolConnection | string)[]; [key: string]: unknown };
  tags?: string[];
  createdDate: string;
  lastMessageDate?: string;
  files?: IGnosisFile[];
  system?: string;
}
export interface IConversationMessage {
  id: number;
  role: 'USER' | 'ASSISTANT' | 'COMMAND';
  text?: string;
  files?: IGnosisFile[];
  createdDate: string;
}
export interface IConversationCreate {
  fileOutput?: IFileOutputSettings;
  name: string;
  model: string;
  options: IConversation['options'];
  tags: string[];
  system: string;
  history: number;
  isConsiderHistory: boolean;
}
export interface IMessageCreate {
  role: 'USER';
  text: string;
  files: number[];
  settings: { tools: IToolConnection[]; isToolsDisabled?: boolean };
}

export interface IToolProgress {
  uid: string;
  name?: string;
  status?: 'STARTED' | 'FINISHED' | 'ERRORED';
}
export interface IConversationProgress {
  data?: { tools?: IToolProgress[]; value?: string };
}

export interface IPaymentTransaction {
  results?: IGnosisFile[];
  operationId?: string | null;
  id: number;
  type: string;
  debet: string;
  credit: string;
  amount: string;
  coinId: string;
  userId: number;
  groupId?: number | null;
  createdDate: string;
  activatedDate?: string | null;
  details?: {
    model?: string;
    options?: { model?: string; tools?: (IToolConnection | string)[] };
    source?: { type: string; id: number | string };
    amounts?: { amount: string; coinId: string }[];
    rates?: { from: string; to: string; value: string }[];
    consumption?: {
      model?: { input?: number; output?: number };
      tools?: {
        models?: Array<IModelDescription['reference']>;
        pending?: Array<{ operationId: string }>;
        type: string;
        amounts?: { amount: string; coinId: string }[];
        status?: string;
        value?: string;
      }[];
    };
  };
}
