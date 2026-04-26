import { ClaudeProvider } from "./claude";
import { DeepSeekProvider } from "./deepseek";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";

export const openAIProvider = new OpenAIProvider();
export const claudeProvider = new ClaudeProvider();
export const geminiProvider = new GeminiProvider();
export const deepseekProvider = new DeepSeekProvider();
