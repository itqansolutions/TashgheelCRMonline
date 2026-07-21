/**
 * ⚙️ JobEngine (Background Task Scheduler & Queue Driver)
 * Supports async delayed tasks, retries with exponential backoff, and Dead Letter Queues (DLQ).
 */
class JobEngine {
    constructor() {
        this.queue = [];
        this.deadLetterQueue = [];
    }

    /**
     * Enqueues job for execution
     * @param {string} jobName 
     * @param {Function} taskFn 
     * @param {Object} [options={ maxRetries: 3 }]
     */
    enqueue(jobName, taskFn, { maxRetries = 3, delayMs = 0 } = {}) {
        const job = {
            id: String(Date.now()),
            name: jobName,
            taskFn,
            maxRetries,
            attempts: 0,
            enqueuedAt: new Date().toISOString()
        };

        console.log(`⚙️ [JobEngine] Enqueued job: '${jobName}' (ID: ${job.id})`);

        if (delayMs > 0) {
            setTimeout(() => this._runJob(job), delayMs);
        } else {
            setImmediate(() => this._runJob(job));
        }
    }

    async _runJob(job) {
        job.attempts++;
        try {
            await job.taskFn();
            console.log(`✅ [JobEngine] Job '${job.name}' (ID: ${job.id}) executed successfully.`);
        } catch (err) {
            console.error(`⚠️ [JobEngine] Job '${job.name}' failed attempt ${job.attempts}/${job.maxRetries}:`, err.message);
            if (job.attempts < job.maxRetries) {
                const backoffMs = Math.pow(2, job.attempts) * 1000;
                setTimeout(() => this._runJob(job), backoffMs);
            } else {
                console.error(`💀 [JobEngine] Job '${job.name}' moved to Dead Letter Queue (DLQ).`);
                this.deadLetterQueue.push({ ...job, error: err.message, failedAt: new Date().toISOString() });
            }
        }
    }

    getDLQ() {
        return this.deadLetterQueue;
    }
}

module.exports = new JobEngine();
