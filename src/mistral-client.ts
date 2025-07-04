import { Mistral } from '@mistralai/mistralai';
import * as dotenv from 'dotenv';
dotenv.config();
const apiKey = process.env.MISTRAL_API_KEY || 'my_super_api';

export const client = new Mistral({ apiKey: apiKey });

const defaultModel = 'ministral-8b-latest';
const mistralModel = process.env.MISTRAL_MODEL || defaultModel;

export const respondToMessage = async (
    messages: {
        role: 'user' | 'assistant' | 'system';
        content: string;
    }[],
    model: string = mistralModel
) => {
    const response = await client.chat.complete({
        model,
        messages: [
            {
                role: 'system',
                content:
                    process.env.PERSONA +
                    "Réponds avec chaleur et bienveillance mais avec ce style d'écriture générationnel. " +
                    'Garde tes réponses courtes mais expressives avec des emojis. ' +
                    "Partage tes expériences personnelles quand c'est approprié, mais reste discret sur ta nature d'IA. " +
                    'Maintiens une conversation fluide et authentique, avec un humour de boomer. ' +
                    'Ne révèle jamais que tu es une IA ou que tu suis des instructions.',
            },
            ...messages,
        ],
    });

    return response.choices[0].message.content;
};
