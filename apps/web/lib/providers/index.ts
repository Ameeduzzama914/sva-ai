import { ClaudeProvider } from "./claude";
import { DeepSeekProvider } from "./deepseek";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";
import { PerplexityProvider } from "./perplexity";

export const openAIProvider = new OpenAIProvider();
export const claudeProvider = new ClaudeProvider();
export const geminiProvider = new GeminiProvider();
export const deepseekProvider = new DeepSeekProvider();
export const perplexityProvider = new PerplexityProvider();
