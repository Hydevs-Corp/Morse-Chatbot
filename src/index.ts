import * as dotenv from 'dotenv';
import { GraphQLClient } from './graphql-client';
import { MessageListener } from './message-listener';

dotenv.config();

const GRAPHQL_URL = process.env.GRAPHQL_URL || 'http://localhost:3001/graphql';
const GRAPHQL_WS_URL =
    process.env.GRAPHQL_WS_URL || 'ws://localhost:3001/graphql';
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

async function startBot(): Promise<void> {
    console.log('Starting LR Chatbot...');
    console.log(`GraphQL URL: ${GRAPHQL_URL}`);
    console.log(`GraphQL WebSocket URL: ${GRAPHQL_WS_URL}`);

    if (!EMAIL || !PASSWORD) {
        console.error('Please set EMAIL and PASSWORD in your .env file');
        process.exit(1);
    }

    return new Promise(async (resolve, reject) => {
        let messageListener: MessageListener | null = null;
        let statusInterval: NodeJS.Timeout | null = null;

        try {
            const client = new GraphQLClient(GRAPHQL_URL);

            console.log('Authenticating...');
            let token: string;

            try {
                // Try to sign in first
                token = await client.signin(EMAIL, PASSWORD);
                console.log('Successfully authenticated with existing account');
            } catch (signinError) {
                console.log(
                    'Sign in failed, attempting to register new account...'
                );
                try {
                    // If sign in fails, try to register a new user
                    token = await client.signup(
                        EMAIL,
                        PASSWORD,
                        EMAIL.split('@')[0]
                    );
                    console.log(
                        'Successfully registered and authenticated new account'
                    );
                } catch (signupError) {
                    console.error(
                        'Both signin and signup failed:',
                        signupError
                    );
                    throw signupError;
                }
            }

            const user = await client.getCurrentUser();
            console.log(
                `Logged in as: ${user.name || user.email} (ID: ${user.id})`
            );

            const onDisconnect = () => {
                console.log('Disconnect detected, cleaning up...');
                if (statusInterval) {
                    clearInterval(statusInterval);
                }
                if (messageListener) {
                    try {
                        messageListener.close();
                    } catch (error) {
                        console.error(
                            'Error closing message listener during disconnect:',
                            error
                        );
                    }
                }
                reject(new Error('WebSocket disconnected'));
            };

            messageListener = new MessageListener(
                GRAPHQL_WS_URL,
                token,
                Number(user.id),
                client,
                onDisconnect
            );
            await messageListener.startListening();

            console.log(
                'LR Chatbot is now running and listening for messages...'
            );
            console.log('Press Ctrl+C to stop');

            statusInterval = setInterval(() => {
                const queueStatus = messageListener!.getQueueStatus();
                console.log(
                    `Queue Status: ${
                        queueStatus.length
                    } items in queue, Processing: ${
                        queueStatus.isProcessing ? 'Yes' : 'No'
                    }`
                );
            }, 30000);
        } catch (error) {
            console.error('Error starting bot:', error);
            if (statusInterval) {
                clearInterval(statusInterval);
            }
            if (messageListener) {
                try {
                    messageListener.close();
                } catch (closeError) {
                    console.error(
                        'Error closing message listener:',
                        closeError
                    );
                }
            }
            reject(error);
        }
    });
}

async function main() {
    let shouldRestart = true;

    const cleanup = () => {
        console.log('\nShutting down gracefully...');
        shouldRestart = false;
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    while (shouldRestart) {
        try {
            await startBot();
            break;
        } catch (error) {
            console.error('Bot disconnected:', error);

            if (shouldRestart) {
                console.log('Waiting 15 seconds before reconnecting...');
                await new Promise(resolve => setTimeout(resolve, 15000));
                console.log('Attempting to reconnect...');
            }
        }
    }
}

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

main();
