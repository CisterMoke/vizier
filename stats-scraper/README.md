# Hackathon Analytics Studio

## Local development

1. Install dependencies:
   - `npm install`
2. Start dev server: `npm run dev`
3. Run unit tests: `npm run test`
4. Run end-to-end tests: `npm run e2e`
5. Build for production: `npm run build`

## API key handling rules

- Never commit real LLM API keys in source, tests, docs, or `.env` files.
- Enter API keys only in the local app form during a session.
- If no API key is provided, the app intentionally switches to offline fallback insight generation.

## Demo seed and fallback behavior

- Mock datasets are generated with deterministic demo seeds so chart output stays stable between runs.
- When generation fails or no API key is provided, the app loads fallback insights and mock datasets so the full workflow still works offline.

## Deploy to Vercel

1. `npm install -g vercel`
2. `vercel login`
3. `vercel`
4. `vercel --prod`

Build command: `npm run build`  
Output directory: `dist`
