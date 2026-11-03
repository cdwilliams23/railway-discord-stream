import pg from "pg";

const { Pool } = pg;
let pool;
const memoryMessages = [];

export async function initStore() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not configured. Using in-memory message storage.");
    return;
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS discord_messages (
      id BIGSERIAL PRIMARY KEY,
      discord_message_id TEXT UNIQUE NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      channel_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'discord'
    )
  `);

  console.log("PostgreSQL message storage is ready.");
}

export async function saveMessage(message) {
  if (!pool) {
    if (memoryMessages.some((savedMessage) => savedMessage.id === message.id)) return null;
    memoryMessages.push(message);
    if (memoryMessages.length > 100) memoryMessages.shift();
    return message;
  }

  const result = await pool.query(
    `INSERT INTO discord_messages
      (discord_message_id, author, content, created_at, channel_id, source)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (discord_message_id) DO NOTHING
     RETURNING discord_message_id AS id, author, content,
       created_at AS "createdAt", channel_id AS "channelId", source`,
    [message.id, message.author, message.content, message.createdAt, message.channelId, message.source]
  );

  return result.rows[0] || null;
}

export async function getRecentMessages(limit = 100) {
  if (!pool) return memoryMessages.slice(-limit);

  const result = await pool.query(
    `SELECT discord_message_id AS id, author, content,
       created_at AS "createdAt", channel_id AS "channelId", source
     FROM discord_messages
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.reverse();
}

export async function closeStore() {
  if (pool) await pool.end();
}
