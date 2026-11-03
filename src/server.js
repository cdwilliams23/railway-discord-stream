import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import { closeStore, getRecentMessages, initStore, saveMessage } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");
const port = Number(process.env.PORT || 3000);
const channelId = process.env.DISCORD_CHANNEL_ID;
const subscribers = new Set();

const app = express();
app.disable("x-powered-by");
app.use(express.static(publicDir));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    discordConfigured: Boolean(process.env.DISCORD_BOT_TOKEN && channelId),
    storage: process.env.DATABASE_URL ? "postgresql" : "memory",
    subscribers: subscribers.size
  });
});

app.get("/api/messages", async (_req, res) => {
  try {
    res.json({ messages: await getRecentMessages() });
  } catch (error) {
    console.error("Failed to load messages", error);
    res.status(500).json({ error: "Unable to load messages" });
  }
});

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(`event: ready\ndata: ${JSON.stringify({ connected: true })}\n\n`);
  subscribers.add(res);

  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    subscribers.delete(res);
  });
});

function publish(message) {
  const payload = `event: message\ndata: ${JSON.stringify(message)}\n\n`;
  for (const subscriber of subscribers) subscriber.write(payload);
}

function normalizeDiscordMessage(message) {
  return {
    id: message.id,
    author: message.author?.globalName || message.author?.username || "Unknown user",
    content: message.cleanContent,
    createdAt: message.createdAt.toISOString(),
    channelId: message.channelId,
    source: "discord"
  };
}

if (process.env.DISCORD_BOT_TOKEN && channelId) {
  const discord = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  discord.once("clientReady", () => {
    console.log(`Discord bot connected as ${discord.user.tag}`);
  });

  discord.on("messageCreate", (message) => {
    if (message.channelId !== channelId || message.author.bot) return;
    saveMessage(normalizeDiscordMessage(message))
      .then((savedMessage) => {
        if (savedMessage) publish(savedMessage);
      })
      .catch((error) => console.error("Failed to persist Discord message", error));
  });

  discord.on("error", (error) => console.error("Discord client error", error));
  discord.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
    console.error("Discord login failed", error);
  });
} else {
  console.warn("Discord is not configured. The web service will run, but no messages will be streamed.");
}

await initStore();

const server = app.listen(port, () => {
  console.log(`Railway Discord Stream listening on port ${port}`);
});

async function shutdown() {
  server.close(async () => {
    await closeStore();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
