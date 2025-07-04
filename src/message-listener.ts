import { Client, createClient } from 'graphql-ws';
import WebSocket from 'ws';
import { GraphQLClient } from './graphql-client';
import { MessageQueuer } from './message-queuer';
import { respondToMessage } from './mistral-client';
import {
    ConversationHistory,
    ConversationHistoryMap,
    Message,
    MessageDeletePayload,
    MessageUpdatePayload,
} from './types';

export class MessageListener {
    private client: Client;
    private token: string;
    private userId: number;
    private graphqlClient: GraphQLClient;
    private history: ConversationHistoryMap;
    private messageQueuer: MessageQueuer;
    private readonly MAX_MESSAGES_PER_CONVERSATION = 30;
    private onDisconnect?: () => void;
    private subscriptions: (() => void)[] = [];

    constructor(
        wsUrl: string,
        token: string,
        userId: number,
        graphqlClient: GraphQLClient,
        onDisconnect?: () => void
    ) {
        this.token = token;
        this.userId = userId;
        this.graphqlClient = graphqlClient;
        this.history = new Map();
        this.messageQueuer = new MessageQueuer();
        this.onDisconnect = onDisconnect;

        this.client = createClient({
            url: wsUrl,
            webSocketImpl: WebSocket,
            connectionParams: {
                Authorization: `Bearer ${token}`,
            },
            keepAlive: 30000, // Keep alive every 30 seconds
            retryAttempts: 5,
            retryWait: async function retry(retries: number) {
                let delay = 1000;
                for (let i = 0; i < retries; i++) {
                    delay *= 2;
                }
                await new Promise(resolve => setTimeout(resolve, delay));
            },
            on: {
                connecting: () => console.log('Connecting to WebSocket...'),
                connected: () => console.log('Connected to WebSocket'),
                closed: event => {
                    console.log('WebSocket connection closed', event);
                    if (this.onDisconnect) {
                        this.onDisconnect();
                    }
                },
                error: (error: any) => {
                    console.error('WebSocket error:', error);
                    if (this.onDisconnect) {
                        this.onDisconnect();
                    }
                },
            },
        });
    }

    async startListening() {
        console.log(
            `Starting to listen for messages for user ${this.userId}...`
        );

        // Wait for the connection to be established before setting up subscriptions
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 10000); // 10 second timeout

            const checkConnection = () => {
                if (this.client) {
                    clearTimeout(timeout);
                    resolve();
                }
            };

            // Check connection status periodically
            const intervalId = setInterval(() => {
                try {
                    // Try to perform a simple operation to check if client is ready
                    checkConnection();
                    clearInterval(intervalId);
                } catch (error) {
                    // Connection not ready yet, continue checking
                }
            }, 100);
        });

        console.log('WebSocket client ready, setting up subscriptions...');

        this.subscribeToMessageAdded();
        this.subscribeToMessageUpdated();
        this.subscribeToMessageDeleted();

        // Add a simple health check
        this.startHealthCheck();

        console.log('All subscriptions set up successfully');
    }

    private startHealthCheck() {
        console.log('Starting health check...');
        // Simple health check - check connection status every 2 minutes
        setInterval(() => {
            console.log('Performing health check...');
            console.log(`Active subscriptions: ${this.subscriptions.length}`);
            console.log(`Message history size: ${this.history.size}`);
            console.log(
                `Queue status: ${JSON.stringify(
                    this.messageQueuer.getQueueStatus()
                )}`
            );
        }, 120000); // Every 2 minutes
    }

    private async ensureConversationHistory(
        conversationId: number
    ): Promise<void> {
        if (!this.history.has(conversationId)) {
            console.log(
                `Fetching history for conversation ${conversationId}...`
            );
            try {
                const messages =
                    await this.graphqlClient.getConversationHistory(
                        conversationId,
                        this.MAX_MESSAGES_PER_CONVERSATION
                    );
                const conversationHistory: ConversationHistory = {
                    conversationId,
                    messages,
                    lastUpdated: new Date(),
                };
                this.history.set(conversationId, conversationHistory);
                console.log(
                    `Loaded ${messages.length} messages for conversation ${conversationId}`
                );
            } catch (error) {
                console.error(
                    `Failed to fetch history for conversation ${conversationId}:`,
                    error
                );
                const conversationHistory: ConversationHistory = {
                    conversationId,
                    messages: [],
                    lastUpdated: new Date(),
                };
                this.history.set(conversationId, conversationHistory);
            }
        }
    }

    private addMessageToHistory(message: Message): void {
        const conversationId = message.conversation.id;
        const conversationHistory = this.history.get(conversationId);

        if (conversationHistory) {
            conversationHistory.messages.push(message);

            if (
                conversationHistory.messages.length >
                this.MAX_MESSAGES_PER_CONVERSATION
            ) {
                conversationHistory.messages =
                    conversationHistory.messages.slice(
                        -this.MAX_MESSAGES_PER_CONVERSATION
                    );
            }

            conversationHistory.lastUpdated = new Date();
            console.log(
                `Added message to history. Conversation ${conversationId} now has ${conversationHistory.messages.length} messages`
            );
        }
    }

    private updateMessageInHistory(
        messageId: string,
        newContent: string,
        conversationId: string
    ): void {
        const convId = parseInt(conversationId);
        const conversationHistory = this.history.get(convId);

        if (conversationHistory) {
            const messageIndex = conversationHistory.messages.findIndex(
                msg => msg.id.toString() === messageId
            );
            if (messageIndex !== -1) {
                conversationHistory.messages[messageIndex].content = newContent;
                conversationHistory.lastUpdated = new Date();
                console.log(
                    `Updated message ${messageId} in history for conversation ${conversationId}`
                );
            }
        }
    }

    private removeMessageFromHistory(
        messageId: number,
        conversationId: string
    ): void {
        const convId = parseInt(conversationId);
        const conversationHistory = this.history.get(convId);

        if (conversationHistory) {
            const initialLength = conversationHistory.messages.length;
            conversationHistory.messages = conversationHistory.messages.filter(
                msg => msg.id !== messageId
            );
            const removedCount =
                initialLength - conversationHistory.messages.length;

            if (removedCount > 0) {
                conversationHistory.lastUpdated = new Date();
                console.log(
                    `Removed message ${messageId} from history for conversation ${conversationId}`
                );
            }
        }
    }

    getConversationHistory(
        conversationId: number
    ): ConversationHistory | undefined {
        return this.history.get(conversationId);
    }

    getAllHistory(): ConversationHistoryMap {
        return this.history;
    }

    private subscribeToMessageAdded() {
        console.log('Setting up messageAdded subscription...');
        const subscription = `
      subscription MessageAdded($userId: Int!) {
        messageAdded(userId: $userId) {
          id
          content
          createdAt
          conversation {
            id
          }
          user {
            id
            email
            name
          }
        }
      }
    `;

        const dispose = this.client.subscribe(
            {
                query: subscription,
                variables: { userId: this.userId },
            },
            {
                next: async (data: any) => {
                    console.log('Received messageAdded event:', data);
                    const message = data.data?.messageAdded as Message;
                    if (message) {
                        const messageId = `msg_${message.id}_${Date.now()}`;
                        this.messageQueuer.enqueue(
                            messageId,
                            message,
                            (payload: Message) => this.processMessage(payload)
                        );
                    }
                },
                error: (error: any) => {
                    console.error('Error in messageAdded subscription:', error);
                    // Try to reconnect if there's an error
                    if (this.onDisconnect) {
                        console.log(
                            'Triggering reconnection due to subscription error'
                        );
                        this.onDisconnect();
                    }
                },
                complete: () => {
                    console.log(
                        'messageAdded subscription completed - this indicates the server closed the subscription'
                    );
                    // Try to reconnect if subscription completes unexpectedly
                    if (this.onDisconnect) {
                        console.log(
                            'Triggering reconnection due to subscription completion'
                        );
                        this.onDisconnect();
                    }
                },
            }
        );
        this.subscriptions.push(dispose);
        console.log('messageAdded subscription set up successfully');
    }

    private subscribeToMessageUpdated() {
        console.log('Setting up messageUpdated subscription...');
        const subscription = `
      subscription MessageUpdated($userId: Int!) {
        messageUpdated(userId: $userId) {
          id
          content
          conversationId
        }
      }
    `;

        const dispose = this.client.subscribe(
            {
                query: subscription,
                variables: { userId: this.userId },
            },
            {
                next: (data: any) => {
                    console.log('Received messageUpdated event:', data);
                    const payload = data.data
                        ?.messageUpdated as MessageUpdatePayload;
                    if (payload) {
                        this.updateMessageInHistory(
                            payload.id,
                            payload.content,
                            payload.conversationId
                        );

                        console.log('Message updated:');
                        console.log(`  Message ID: ${payload.id}`);
                        console.log(`  New content: ${payload.content}`);
                        console.log(
                            `  Conversation: ${payload.conversationId}`
                        );
                        console.log('---');
                    }
                },
                error: (error: any) => {
                    console.error(
                        'Error in messageUpdated subscription:',
                        error
                    );
                    if (this.onDisconnect) {
                        console.log(
                            'Triggering reconnection due to subscription error'
                        );
                        this.onDisconnect();
                    }
                },
                complete: () => {
                    console.log(
                        'messageUpdated subscription completed - this indicates the server closed the subscription'
                    );
                    if (this.onDisconnect) {
                        console.log(
                            'Triggering reconnection due to subscription completion'
                        );
                        this.onDisconnect();
                    }
                },
            }
        );
        this.subscriptions.push(dispose);
        console.log('messageUpdated subscription set up successfully');
    }

    private subscribeToMessageDeleted() {
        console.log('Setting up messageDeleted subscription...');
        const subscription = `
      subscription MessageDeleted($userId: Int!) {
        messageDeleted(userId: $userId) {
          messageId
          conversationId
        }
      }
    `;

        const dispose = this.client.subscribe(
            {
                query: subscription,
                variables: { userId: this.userId },
            },
            {
                next: (data: any) => {
                    console.log('Received messageDeleted event:', data);
                    const payload = data.data
                        ?.messageDeleted as MessageDeletePayload;
                    if (payload) {
                        this.removeMessageFromHistory(
                            payload.messageId,
                            payload.conversationId
                        );

                        console.log('Message deleted:');
                        console.log(`  Message ID: ${payload.messageId}`);
                        console.log(
                            `  Conversation: ${payload.conversationId}`
                        );
                        console.log('---');
                    }
                },
                error: (error: any) => {
                    console.error(
                        'Error in messageDeleted subscription:',
                        error
                    );
                    if (this.onDisconnect) {
                        console.log(
                            'Triggering reconnection due to subscription error'
                        );
                        this.onDisconnect();
                    }
                },
                complete: () => {
                    console.log(
                        'messageDeleted subscription completed - this indicates the server closed the subscription'
                    );
                    if (this.onDisconnect) {
                        console.log(
                            'Triggering reconnection due to subscription completion'
                        );
                        this.onDisconnect();
                    }
                },
            }
        );
        this.subscriptions.push(dispose);
        console.log('messageDeleted subscription set up successfully');
    }

    private async processMessage(message: Message): Promise<void> {
        await this.ensureConversationHistory(message.conversation.id);

        this.addMessageToHistory(message);

        console.log('Processing queued message:');
        console.log(
            `  From: ${message.user.name || message.user.email} (ID: ${
                message.user.id
            })`
        );
        console.log(`  Content: ${message.content}`);
        console.log(`  Conversation: ${message.conversation.id}`);
        console.log(`  Time: ${new Date(message.createdAt).toLocaleString()}`);
        console.log('---');

        // if (
        //     this.messageQueuer
        //         .getQueueStatus()
        //         .items.some(
        //             item =>
        //                 item.payload.conversation.id === message.conversation.id
        //         )
        // ) {
        //     console.log(
        //         `Skipping message ${message.id} for conversation ${message.conversation.id} because another message is already in the queue`
        //     );
        //     return;
        // }

        // Check if the message is from the bot itself
        if (message.user.id + '' === this.userId + '') {
            console.log(
                `Skipping message ${message.id} because it is from the bot itself`
            );
            return;
        }

        // const isDestinedForMichel = await isTheMessageDestinedForMichel(
        //     (this.history.get(message.conversation.id)?.messages || []).reduce(
        //         (acc, msg) => {
        //             acc.push({
        //                 role:
        //                     msg.user.id === this.userId ? 'assistant' : 'user',
        //                 content: msg.content,
        //             });
        //             return acc;
        //         },
        //         [] as Array<{
        //             role: 'user' | 'assistant';
        //             content: string;
        //         }>
        //     )
        // );

        // if (!isDestinedForMichel) {
        //     console.log(
        //         `Skipping message ${message.id} because it is not destined for Michel`
        //     );
        //     return;
        // }

        const response = await respondToMessage(
            (this.history.get(message.conversation.id)?.messages || []).reduce(
                (acc, message) => {
                    if (message.user.id !== this.userId) {
                        // Add system message before user message
                        // acc.push({
                        //     role: 'system',
                        //     content: `The following message will come from the user named "${
                        //         message.user.name || message.user.email
                        //     }"`,
                        // });
                        acc.push({
                            role: 'user',
                            content:
                                message.content + '\n\n' + message.user.name ||
                                message.user.email,
                        });
                    } else {
                        acc.push({
                            role: 'assistant',
                            content: message.content,
                        });
                    }
                    return acc;
                },
                [] as Array<{
                    role: 'user' | 'assistant' | 'system';
                    content: string;
                }>
            )
        );

        console.log('Response from Mistral:', response);

        if (response) {
            try {
                const responseText =
                    typeof response === 'string'
                        ? response
                        : JSON.stringify(response);
                const sentMessage = await this.graphqlClient.sendMessage(
                    parseInt(message.conversation.id + ''),
                    responseText
                );
                console.log('Successfully sent AI response:', sentMessage.id);
            } catch (error) {
                console.error('Failed to send AI response:', error);
            }
        }
    }

    getQueueStatus() {
        return this.messageQueuer.getQueueStatus();
    }

    clearQueue(): void {
        this.messageQueuer.clearQueue();
    }

    close() {
        console.log('Closing WebSocket connection...');

        // Dispose of all subscriptions
        this.subscriptions.forEach(dispose => {
            try {
                dispose();
            } catch (error) {
                console.error('Error disposing subscription:', error);
            }
        });
        this.subscriptions = [];

        // Dispose of the client
        try {
            this.client.dispose();
        } catch (error) {
            console.error('Error disposing client:', error);
        }
    }
}
