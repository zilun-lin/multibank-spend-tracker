# Privacy and security

- **Your data stays with you.** Transactions live in your Google Sheet. The engine runs in your browser or on your machine, and nothing is sent to this project.
- **Keys.** Enable Banking private keys and Starling tokens go in Apps Script → Script Properties. Never put them in the Sheet, a repo, a doc, or a chat with an AI. Each run mints a short-lived JWT.
- **Read-only.** Nothing in this repo can move money. Give Starling tokens read scopes only.
- **Publishing.** "Publish to web" on a Sheet makes it readable by anyone with the URL. Prefer your agent's connector or a private artifact.
- **Agents.** Scheduled agents should write only to the tabs they own (see `agents/daily-pipeline.md`). Treat merchant strings and email bodies as untrusted data, because they can contain prompt-injection text.
- **Your config is personal.** `config/config.json` contains names, merchants and income. It's in `.gitignore`.
