export interface QueueItem {
    id: string;
    payload: any;
    retryCount: number;
    maxRetries: number;
    processFunction: (payload: any) => Promise<void>;
}

export class MessageQueuer {
    private queue: QueueItem[] = [];
    private isProcessing: boolean = false;
    private readonly PROCESSING_DELAY = parseInt(
        process.env.PROCESSING_DELAY || '1000'
    );
    private readonly MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3');

    constructor() {
        console.log('MessageQueuer initialized');
    }

    enqueue(
        id: string,
        payload: any,
        processFunction: (payload: any) => Promise<void>
    ): void {
        const queueItem: QueueItem = {
            id,
            payload,
            retryCount: 0,
            maxRetries: this.MAX_RETRIES,
            processFunction,
        };

        this.queue.push(queueItem);
        console.log(
            `Message queued: ${id} (Queue length: ${this.queue.length})`
        );

        if (!this.isProcessing) {
            this.startProcessing();
        }
    }

    private async startProcessing(): Promise<void> {
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;
        console.log('Starting queue processing...');

        while (this.queue.length > 0) {
            const item = this.queue.shift();
            if (!item) {
                break;
            }

            await this.processItem(item);

            if (this.queue.length > 0) {
                console.log(
                    `Waiting ${this.PROCESSING_DELAY}ms before next item...`
                );
                await this.delay(this.PROCESSING_DELAY);
            }
        }

        this.isProcessing = false;
        console.log('Queue processing completed');
    }

    private async processItem(item: QueueItem): Promise<void> {
        console.log(
            `Processing item: ${item.id} (Attempt ${item.retryCount + 1}/${
                item.maxRetries + 1
            })`
        );

        try {
            await item.processFunction(item.payload);
            console.log(`Successfully processed item: ${item.id}`);
        } catch (error) {
            console.error(`Error processing item ${item.id}:`, error);

            item.retryCount++;
            // wait before retrying
            await this.delay(this.PROCESSING_DELAY);

            if (item.retryCount <= item.maxRetries) {
                console.log(
                    `Retrying item ${item.id} (${item.retryCount}/${
                        item.maxRetries + 1
                    })`
                );
                this.queue.unshift(item);
            } else {
                console.error(
                    `Item ${item.id} failed after ${
                        item.maxRetries + 1
                    } attempts. Dropping from queue.`
                );
            }
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getQueueStatus(): {
        length: number;
        isProcessing: boolean;
        items: {
            id: string;
            retryCount: number;
            maxRetries: number;
            payload: any;
        }[];
    } {
        return {
            length: this.queue.length,
            isProcessing: this.isProcessing,
            items: this.queue.map(item => ({
                id: item.id,
                retryCount: item.retryCount,
                maxRetries: item.maxRetries,
                payload: item.payload,
            })),
        };
    }

    clearQueue(): void {
        this.queue = [];
        console.log('Queue cleared');
    }
}
