export interface User {
    id: number;
    email: string;
    name?: string;
}

export interface Message {
    id: number;
    content: string;
    createdAt: string;
    conversation: {
        id: number;
    };
    user: User;
}

export interface MessageUpdatePayload {
    id: string;
    content: string;
    conversationId: string;
}

export interface MessageDeletePayload {
    messageId: number;
    conversationId: string;
}

export interface AuthResponse {
    user: User;
    token: string;
}

export interface ConversationHistory {
    conversationId: number;
    messages: Message[];
    lastUpdated: Date;
}

export type ConversationHistoryMap = Map<number, ConversationHistory>;
