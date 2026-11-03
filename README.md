# Railway Discord Stream

A small full-stack project for the Railway interview exercise. A Discord bot listens to one configured Discord channel, sends normalized message events to a Node.js backend, and the browser receives those events through Server-Sent Events (SSE).

## Architecture

```text
Discord channel -> Discord Gateway -> discord.js bot -> Express backend -> SSE -> browser frontend
                                                    \-> PostgreSQL (or in-memory fallback)
```

The frontend depends on the backend for both the initial message history (`GET /api/messages`) and live updates (`GET /events`). The Discord bot token is used only on the server and is never exposed to the browser.

## Run locally

1. Create a Discord application and bot in the Discord Developer Portal.
2. Enable the **Message Content Intent** for the bot.
3. Invite the bot to a test server with permission to view the target channel and read message history.
4. Copy `.env.example` to `.env` and set `DISCORD_BOT_TOKEN` and `DISCORD_CHANNEL_ID`. Set `DATABASE_URL` when using PostgreSQL and `VIEWER_ACCESS_TOKEN` to require viewer login.
5. Install and run:

```bash
npm install
npm start
```

Open `http://localhost:3000`. Use `http://localhost:3000/health` to inspect service state.

## Design choices

- **SSE instead of polling:** the browser receives one-way server-to-client updates with automatic browser reconnect behavior. WebSockets would be appropriate if the browser also needed to send interactive messages.
- **PostgreSQL with local fallback:** when `DATABASE_URL` is configured, messages are persisted before being broadcast. Without it, the app uses an in-memory fallback so the demo still runs locally.
- **One configured channel:** avoids accidentally exposing an entire Discord server and keeps authorization simple for the interview demo.
- **Viewer access token:** when `VIEWER_ACCESS_TOKEN` is configured, browsers must sign in before reading history or opening the live stream. The token is stored in an HttpOnly cookie; the Discord bot token remains server-only.
- **Normalized event shape:** the frontend is independent of Discord.js objects and can later support another event source.
- **Escaped rendering:** message content is assigned with `textContent` to avoid treating Discord messages as HTML.

## Known limitations and next steps

- Without `DATABASE_URL`, historical messages are lost on restart.
- The viewer access layer is intentionally small: it provides shared-token access, not individual accounts or per-user roles.
- The bot currently ignores edits, deletions, attachments, and thread-specific behavior.
- Future improvements could add viewer authentication, Redis or a queue for multi-instance fan-out, metrics, structured logs, rate-limit handling, and reconnect monitoring.
- The server keeps one SSE connection per browser process. A multi-instance deployment would need shared pub/sub so every instance can receive the same Discord event.

## Railway deployment

Create a Railway service from this repository, set `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DATABASE_URL`, and `VIEWER_ACCESS_TOKEN` as service variables, and deploy. Railway supplies `PORT` automatically. The public URL should load the frontend; `/health` provides a simple deployment check.
