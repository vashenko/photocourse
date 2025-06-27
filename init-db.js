import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs/promises';

const DB_FILE_NAME = 'db.sqlite';

export const openDb = async () => {
  try {
    await fs.access(DB_FILE_NAME);
  } catch (err) {
    await fs.writeFile(DB_FILE_NAME, '');
  } finally {
    const db = await open({
      filename: `./${DB_FILE_NAME}`,
      driver: sqlite3.Database,
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS user (
        user_id INTEGER,
        phone TEXT,
        email TEXT,
        first_name TEXT,
        last_name TEXT,
        first_notification_sent BOOLEAN DEFAULT false,
        second_notification_sent BOOLEAN DEFAULT false,
        created_at DATE DEFAULT (datetime('now'))
      )
    `);

    return db;
  }
};
