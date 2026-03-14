// packages/shared-types/src/team-comm.ts
// Secure team communication types — HIPAA §164.530(j) retention applies

export interface CommThreadResponse {
  id: string;
  patientId: string;
  locationId: string;
  subject: string;
  createdByUserId?: string;
  createdAt: string;
  lastMessageAt?: string;
  lastMessageBody?: string;
  messageCount: number;
}

export interface CommThreadListResponse {
  threads: CommThreadResponse[];
  total: number;
}

export interface CreateCommThreadInput {
  subject: string;
  initialMessage?: string;
}

export interface CommMessageResponse {
  id: string;
  threadId: string;
  patientId: string;
  locationId: string;
  authorUserId?: string;
  body: string;
  sentAt: string;
}

export interface CommMessageListResponse {
  messages: CommMessageResponse[];
  total: number;
}

export interface SendCommMessageInput {
  body: string;
}
