# How do I make Claude, ChatGPT or another AI agent my budgeting assistant or personal CFO?

**Short answer:** give the agent (1) live data (a Google Sheet fed daily), (2) a deterministic engine it can run instead of doing mental arithmetic, (3) skills that define how to answer, and (4) scheduled tasks. multibank-spend-tracker ships all four:

| Piece | In this repo |
|---|---|
| Live data | `connectors/apps-script/bank_sync.gs` + Lunch Flow → Google Sheet |
| Engine | `src/cli.js explain / summary / check`, or the MCP server `mcp/server.js` |
| Skills | `skills/finance-assistant`, `skills/personal-cfo`, `skills/finance-dashboard-design` |
| Schedules | `agents/daily-pipeline.md`, `agents/receipt-enrichment.md` |

## Platform notes
- **Claude:** upload the three skills, connect Google Sheets and Gmail, create scheduled tasks from the prompts, and publish the dashboard as an artifact. Claude Desktop and Claude Code can also run `mcp/server.js`.
- **ChatGPT:** paste the SKILL.md content into a Project's instructions or a custom GPT, connect Google Drive and Gmail, and use Tasks for the schedules. Use canvas for the dashboard HTML.
- **Any MCP client:** add `mcp/server.js` (stdio). It exposes `spend_explain`, `spend_summary`, `spend_check_purchase`, `spend_recurring`, `spend_uncategorised` and `spend_ledger`.

Example questions once it's set up: "Why am I over budget this month?", "Can I buy a £180 jacket?", "Any new subscriptions?", "What did I spend on the house since September?"
