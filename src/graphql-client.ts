import fetch from 'node-fetch';
import { AuthResponse, Message } from './types';

export class GraphQLClient {
    private url: string;
    private token: string | null = null;

    constructor(url: string) {
        this.url = url;
    }

    setToken(token: string) {
        this.token = token;
    }

    async query(query: string, variables: any = {}) {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(this.url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                query,
                variables,
            }),
        });

        const result = await response.json();

        if (result.errors) {
            throw new Error(`GraphQL Error: ${JSON.stringify(result.errors)}`);
        }

        return result.data;
    }

    async signin(email: string, password: string): Promise<string> {
        const query = `
      mutation Signin($email: String!, $password: String!) {
        signin(email: $email, password: $password)
      }
    `;

        const data = await this.query(query, { email, password });
        const token = data.signin;
        this.setToken(token);
        return token;
    }

    async signup(
        email: string,
        password: string,
        name?: string
    ): Promise<string> {
        const query = `
      mutation Signup($email: String!, $password: String!, $name: String!) {
        signup(email: $email, password: $password, name: $name) {
          token
        }
      }
    `;

        const userName = name || email.split('@')[0];

        const data = await this.query(query, {
            email,
            password,
            name: userName,
        });
        const token = data.signup.token;
        this.setToken(token);
        return token;
    }

    async getCurrentUser() {
        const query = `
      query Me {
        me {
          id
          email
          name
        }
      }
    `;

        const data = await this.query(query);
        return data.me;
    }

    async getConversations(): Promise<any[]> {
        const query = `
      query GetConversations {
        conversations {
          id
        }
      }
    `;

        const data = await this.query(query);
        return data.conversations || [];
    }

    async getConversationHistory(
        conversationId: number,
        limit: number = 30
    ): Promise<Message[]> {
        const query = `
      query GetConversationMessages($conversationId: Int!) {
        conversation(id: $conversationId) {
          messages {
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
      }
    `;

        const data = await this.query(query, {
            conversationId: parseInt(conversationId + ''),
        });

        if (!data.conversation || !data.conversation.messages) {
            return [];
        }

        const sortedMessages = data.conversation.messages.sort(
            (a: any, b: any) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime()
        );

        return sortedMessages.slice(-limit);
    }

    async sendMessage(conversationId: number, content: string): Promise<any> {
        const mutation = `
            mutation SendMessage($conversationId: Int!, $content: String!) {
                sendMessage(conversationId: $conversationId, content: $content) {
                    id
                    content
                    createdAt
                    user {
                        id
                        email
                        name
                    }
                    conversation {
                        id
                    }
                }
            }
        `;

        const data = await this.query(mutation, {
            conversationId,
            content,
        });

        return data.sendMessage;
    }
}
