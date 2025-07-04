import { GraphQLClient } from './graphql-client';
import { MessageListener } from './message-listener';
import * as dotenv from 'dotenv';

dotenv.config();

const GRAPHQL_URL = process.env.GRAPHQL_URL || 'http://localhost:3000/graphql';
const GRAPHQL_WS_URL =
    process.env.GRAPHQL_WS_URL || 'ws://localhost:3000/graphql';
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
const USER_ID = parseInt(process.env.USER_ID || '1');

async function testHistoryFunctionality() {
    console.log('Testing history functionality...');

    if (!EMAIL || !PASSWORD) {
        console.error('Please set EMAIL and PASSWORD in your .env file');
        return;
    }

    try {
        const client = new GraphQLClient(GRAPHQL_URL);

        console.log('Authenticating...');
        const token = await client.signin(EMAIL, PASSWORD);
        console.log('Authentication successful');

        console.log('Fetching available conversations...');
        try {
            const conversations = await client.getConversations();
            console.log(`Found ${conversations.length} conversations`);

            if (conversations.length > 0) {
                console.log(
                    'Available conversation IDs:',
                    conversations.map(c => c.id).join(', ')
                );

                const testConversationId = parseInt(conversations[0].id);
                console.log(
                    `Testing history fetch for conversation ${testConversationId}...`
                );

                const messages = await client.getConversationHistory(
                    testConversationId,
                    5
                );
                console.log(
                    `Retrieved ${messages.length} messages from conversation ${testConversationId}`
                );

                if (messages.length > 0) {
                    console.log('Sample messages:');
                    messages.slice(0, 3).forEach((msg, index) => {
                        console.log(
                            `  ${index + 1}. [${new Date(
                                msg.createdAt
                            ).toLocaleTimeString()}] ${
                                msg.user.name || msg.user.email
                            }: ${msg.content}`
                        );
                    });
                }
            } else {
                console.log('ℹNo conversations found in the system');
            }
        } catch (error) {
            console.error('Error fetching conversations:', error);
        }

        console.log('Testing direct history fetch for conversation 1...');
        try {
            const messages = await client.getConversationHistory(1, 5);
            console.log(
                `Retrieved ${messages.length} messages from conversation 1`
            );

            if (messages.length > 0) {
                console.log('Sample messages:');
                messages.slice(0, 3).forEach((msg, index) => {
                    console.log(
                        `  ${index + 1}. [${new Date(
                            msg.createdAt
                        ).toLocaleTimeString()}] ${
                            msg.user.name || msg.user.email
                        }: ${msg.content}`
                    );
                });
            }
        } catch (error) {
            console.log("No messages found or conversation doesn't exist");
        }

        console.log('Testing MessageListener history management...');
        const messageListener = new MessageListener(
            GRAPHQL_WS_URL,
            token,
            USER_ID,
            client
        );

        const testConversationId = 1;
        console.log(
            `Getting history for conversation ${testConversationId}...`
        );

        const history =
            messageListener.getConversationHistory(testConversationId);
        if (history) {
            console.log(`History found: ${history.messages.length} messages`);
        } else {
            console.log('ℹNo history available for this conversation yet');
        }

        console.log('History functionality test completed');
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testHistoryFunctionality();
