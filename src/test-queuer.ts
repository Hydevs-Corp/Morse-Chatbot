import { MessageQueuer } from './message-queuer';

// Simple test to demonstrate the queuer functionality
async function testMessageQueuer() {
    console.log('🧪 Testing MessageQueuer...');

    const queuer = new MessageQueuer();

    // Create some test functions that simulate message processing
    const createTestProcessor = (messageId: string, shouldFail = false) => {
        return async (payload: any) => {
            console.log(`🔄 Processing test message: ${messageId}`);

            if (shouldFail) {
                throw new Error(`Simulated error for ${messageId}`);
            }

            console.log(
                `✅ Successfully processed: ${messageId} with payload:`,
                payload
            );
        };
    };

    // Queue several messages
    console.log('\n📥 Queuing messages...');

    queuer.enqueue(
        'test-msg-1',
        { content: 'Hello World!' },
        createTestProcessor('test-msg-1')
    );
    queuer.enqueue(
        'test-msg-2',
        { content: 'Second message' },
        createTestProcessor('test-msg-2')
    );
    queuer.enqueue(
        'test-msg-3',
        { content: 'This will fail' },
        createTestProcessor('test-msg-3', true)
    );
    queuer.enqueue(
        'test-msg-4',
        { content: 'Fourth message' },
        createTestProcessor('test-msg-4')
    );

    // Wait a bit to see the queue processing
    await new Promise(resolve => setTimeout(resolve, 8000));

    console.log('\n📊 Final queue status:', queuer.getQueueStatus());

    console.log('\n✅ Test completed!');
}

// Run the test if this file is executed directly
if (require.main === module) {
    testMessageQueuer().catch(console.error);
}

export { testMessageQueuer };
