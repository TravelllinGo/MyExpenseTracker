import sqlite3 from 'sqlite3';
sqlite3.verbose();
const db = new sqlite3.Database('expenses.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    salary REAL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT,
    amount REAL,
    category TEXT,
    date TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

export default db;
