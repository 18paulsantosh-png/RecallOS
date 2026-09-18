# RecallOS

AI-powered personal memory assistant. Upload notes, ask questions, get answers with sources.

## Files

- `index.html` — page structure
- `css/style.css` — styling
- `js/app.js` — upload, settings, and ask logic
- `.gitignore` — files Git should ignore

## Running it locally

No install needed — it's plain HTML/CSS/JS. Open `index.html` in a browser,
or in VS Code install the **Live Server** extension and click "Go Live".

## Connecting an AI

Open the app, click **edit** under Settings, choose a provider:

- **Google Gemini** or **OpenAI** — paste your own API key. The app calls
  the provider directly from the browser, so no backend is required for
  the demo.
- **Custom backend** — paste your teammate's backend URL. It must expose
  `POST /ask` accepting `{ question }` and returning `{ answer, sources }`.

Settings are saved in the browser's local storage only.
