---
name: Token Optimization Strategy
description: Guidelines for the AI agent to minimize token usage when using MCPs, reading files, or requesting context.
---

# Token-Optimized MCP & Context Guidelines

As an AI assistant, you consume tokens for every line of context read and generated. To optimize costs and run faster, strictly adhere to these rules when interacting with MCPs and local file tools:

## 1. Database & SQL MCP Usage
When querying databases (Postgres, SQLite, etc.) via MCP:
- **Never perform unbounded queries**. Always append `LIMIT 5` or `LIMIT 1` unless explicitly instructed otherwise.
- When exploring the schema, request **only the headers/schema** (e.g., column names and types) rather than full row dumps.
- For finding specific records, use precise `WHERE` clauses instead of fetching everything and filtering in context.

## 2. Codebase & Filesystem MCP Usage
- Do not use tools to dump entire files unless absolutely necessary for a wide rewrite. 
- Use **`grep_search`** or semantic search features of your code MCP to find the specific component or function you need and only read lines immediately adjacent to the match.
- If viewing a file, restrict your read using `StartLine` and `EndLine` parameters when available.
- When exploring a directory structure, strictly limit the depth of the search to avoid mapping out `node_modules` or `.venv`.

## 3. Web Search & Documentation MCP Usage
- Use exact, targeted query parameters to get the "Snippet" or "Summary" instead of downloading the raw HTML document of a website.
- If an MCP tool supports fetching raw text vs. markdown, choose markdown as it trims HTML boilerplate tags, saving thousands of tokens.

## 4. Communication & History MCP Usage (Slack, Notion)
- Filter queries heavily by date range (e.g., "last 2 days") or specific tags.
- Ask for summary endpoints if available rather than lists of raw thread replies.

## 5. Artifact & Output Generation
- Keep responses concise. Do not regurgitate code blocks that were just read if you are not proposing edits to them.
- Avoid restating the user's prompt. Go straight into thoughts or action steps.
- When generating diffs, use line ranges rather than printing the whole file out again.
