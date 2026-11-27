export default class OpenAI { constructor() { this.responses = { create: async () => { throw new Error("LLM disabled in tests"); } }; } }
