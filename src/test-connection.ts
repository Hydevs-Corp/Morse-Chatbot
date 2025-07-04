import { GraphQLClient } from './graphql-client';
import * as dotenv from 'dotenv';

dotenv.config();

const GRAPHQL_URL = process.env.GRAPHQL_URL || 'http://localhost:3000/graphql';
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

async function testConnection() {
    console.log('Testing GraphQL connection...');
    console.log(`GraphQL URL: ${GRAPHQL_URL}`);

    if (!EMAIL || !PASSWORD) {
        console.error('Please set EMAIL and PASSWORD in your .env file');
        return;
    }

    try {
        const client = new GraphQLClient(GRAPHQL_URL);

        console.log('Testing authentication...');
        const token = await client.signin(EMAIL, PASSWORD);
        console.log('Authentication successful');
        console.log(`Token: ${token.substring(0, 20)}...`);

        const user = await client.getCurrentUser();
        console.log('User info retrieved');
        console.log(`User: ${JSON.stringify(user, null, 2)}`);
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testConnection();
