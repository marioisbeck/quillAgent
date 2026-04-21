export type ApprovalStatus = 
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested'
  | 'continuous_improvement';

export type ConnectorType = 
  | 'gmail'
  | 'mail'
  | 'calendar'
  | 'drive'
  | 'slack'
  | 'shell'
  | 'files'
  | 'github'
  | 'custom';

export type CalendarProvider =
  | 'google'
  | 'icloud'
  | 'prometheon';

export type MailProvider =
  | 'google'
  | 'prometheon';

export type CalendarApprovalOperation =
  | 'create_event'
  | 'update_event'
  | 'delete_event';

export type MailApprovalOperation =
  | 'send_message';

export type ApprovalExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

export interface ApprovalPreview {
  title: string;
  body: string;
  metadata?: Record<string, string>;
}

export interface CalendarApprovalDetails extends Record<string, any> {
  kind: 'calendar_write';
  provider: CalendarProvider;
  source: string;
  account: string;
  calendarId: string;
  calendarName: string;
  calendarPath?: string;
  operation: CalendarApprovalOperation;
  eventId?: string;
  start?: string;
  end?: string;
  description?: string;
  location?: string;
  attendees?: string;
  allDay?: boolean;
  timezone?: string;
  bridgeApprovalId?: string;
  resumeToken?: string;
  executionStatus?: ApprovalExecutionStatus;
  executedAt?: string;
  executionResult?: Record<string, any>;
  executionError?: string;
}

export interface MailApprovalDetails extends Record<string, any> {
  kind: 'mail_send';
  provider: MailProvider;
  source: string;
  account: string;
  operation: MailApprovalOperation;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyPreview?: string;
  hasAttachments?: boolean;
  attachmentNames?: string[];
  draftId?: string;
  inReplyToMessageId?: string;
  threadId?: string;
  bridgeApprovalId?: string;
  resumeToken?: string;
  executionStatus?: ApprovalExecutionStatus;
  executedAt?: string;
  executionResult?: Record<string, any>;
  executionError?: string;
}

export interface ActionPayload {
  connector: ConnectorType;
  summary: string;
  details: Record<string, any>;
  // For Tinder-style UI, we might want a rich preview
  preview?: ApprovalPreview;
}

export interface ApprovalRequest {
  id: string;
  action: string;
  payload: ActionPayload;
  status: ApprovalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalDecision {
  approvalId: string;
  decision: 'approve' | 'reject' | 'request_changes' | 'continuous_improvement';
  feedback?: string; // Used when requesting changes or continuous improvement
  manualEdit?: Partial<ActionPayload>; // If the user manually edited the payload
}

export interface ApprovalExecutionUpdate {
  executionStatus: ApprovalExecutionStatus;
  executedAt?: string;
  executionResult?: Record<string, any>;
  executionError?: string;
}

export interface AuditLog {
  id: string;
  approvalId: string;
  action: string;
  details: string;
  createdAt: string;
}

export interface Token {
  id: string;
  service: ConnectorType;
  accessToken: string;
  refreshToken?: string;
  updatedAt: string;
}

export interface SharedState {
  key: string;
  value: any;
  updatedAt: string;
}
