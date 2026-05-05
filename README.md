# SVA (Super Verified AI)

SVA compares three model slots (**GPT**, **Gemini**, **DeepSeek**) powered through **OpenRouter**.

## Required
- `OPENROUTER_API_KEY`

## Optional model routing
- `OPENROUTER_MODEL_A` (default `mistralai/mistral-7b-instruct:free`)
- `OPENROUTER_MODEL_B` (default `meta-llama/llama-3.1-8b-instruct:free`)
- `OPENROUTER_MODEL_C` (default `google/gemma-7b-it:free`)

## Retrieval
- `RETRIEVAL_PROVIDER=mock` (or `web`, `none`)
- `WEB_RETRIEVAL_ENDPOINT=https://google.serper.dev/search`
- `WEB_RETRIEVAL_API_KEY=`

## Public URL
- `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
