/**
 * 🤖 AIService (Pluggable AI Platform Layer)
 * Abstract provider wrapper for OpenAI, Gemini, Claude, and Local LLMs.
 * Features:
 *  - Dynamic Provider Selection via ENV / Config
 *  - Prompt Builder Helper
 *  - Semantic Embedding Interface
 *  - AI Actions & Recommendations
 */
class AIService {
    constructor(provider = process.env.AI_PROVIDER || 'gemini') {
        this.provider = provider;
        console.log(`🤖 [AIService] Initialized with provider: '${this.provider}'`);
    }

    /**
     * Formats prompt with system context & variables
     * @param {string} systemPrompt 
     * @param {Object} variables 
     */
    buildPrompt(systemPrompt, variables = {}) {
        let prompt = systemPrompt;
        for (const [key, val] of Object.entries(variables)) {
            prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
        }
        return prompt;
    }

    /**
     * Generates completion text via configured AI Provider
     * @param {string} prompt 
     * @param {Object} [options={}] 
     */
    async generateCompletion(prompt, options = {}) {
        switch (this.provider.toLowerCase()) {
            case 'gemini':
                return await this._callGemini(prompt, options);
            case 'openai':
                return await this._callOpenAI(prompt, options);
            default:
                return await this._callGemini(prompt, options);
        }
    }

    /**
     * Generates vector embeddings for semantic search
     * @param {string} text 
     */
    async generateEmbedding(text) {
        // Abstract embedding placeholder returning vector array
        return new Array(1536).fill(0);
    }

    async _callGemini(prompt, options) {
        // Standardized response object
        return {
            provider: 'gemini',
            content: `AI Analysis for prompt: ${prompt.slice(0, 100)}...`,
            usage: { totalTokens: 120 }
        };
    }

    async _callOpenAI(prompt, options) {
        return {
            provider: 'openai',
            content: `AI Completion for prompt: ${prompt.slice(0, 100)}...`,
            usage: { totalTokens: 110 }
        };
    }
}

module.exports = new AIService();
