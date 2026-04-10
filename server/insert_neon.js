const { Pool } = require('pg');

const connectionString = 'postgresql://neondb_owner:npg_bkit7ZJGfr3D@ep-dry-sea-amw61lme-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const keysToInsert = [
  "WhatsApp Image 2026-04-10 at 11.47.25 PM (1).jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.25 PM.jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.26 PM (1).jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.26 PM (2).jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.26 PM.jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.27 PM (1).jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.27 PM.jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.28 PM (1).jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.28 PM.jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.29 PM (1).jpeg",
  "WhatsApp Image 2026-04-10 at 11.47.29 PM (2).jpeg"
];

async function insertKeys() {
  try {
    console.log("Connecting to database...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS world_images (
        id TEXT PRIMARY KEY,
        image_url TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("Table ready.");

    await pool.query(`TRUNCATE TABLE world_images`);
    console.log("Table truncated.");

    for (let i = 0; i < keysToInsert.length; i++) {
        const key = keysToInsert[i];
        const encodedUrl = "World%20Images/" + encodeURIComponent(key).replace(/\(/g, "%28").replace(/\)/g, "%29");
        const imageId = 'wi-' + Date.now() + '-' + i;
        await pool.query(
            `INSERT INTO world_images (id, image_url) VALUES ($1, $2)`,
            [imageId, encodedUrl]
        );
        console.log("Inserted:", encodedUrl);
    }
    console.log("All done!");
    process.exit(0);
  } catch (err) {
    console.error("Error inserting:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

insertKeys();
