// db.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// El archivo de base de datos se guardará como gestor-am.db en la raíz
const dbPath = path.join(__dirname, "gestor-am.db");
const db = new sqlite3.Database(dbPath);

// Crear tablas y usuario admin por defecto
db.serialize(() => {
  // Tabla de usuarios
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Si la tabla ya existía sin created_at, la agregamos
  db.all(`PRAGMA table_info(users)`, (err, columns) => {
    if (err) {
      console.error("Error leyendo esquema de users:", err);
      return;
    }
    const hasCreatedAt = columns.some((col) => col.name === "created_at");
    if (!hasCreatedAt) {
      db.run(`ALTER TABLE users ADD COLUMN created_at TEXT`, (alterErr) => {
        if (alterErr) {
          console.error("Error agregando columna created_at:", alterErr);
          return;
        }
        // Rellenar con fecha actual para usuarios antiguos
        db.run(
          `UPDATE users
           SET created_at = datetime('now')
           WHERE created_at IS NULL OR created_at = ''`,
          (updateErr) => {
            if (updateErr) {
              console.error("Error rellenando created_at:", updateErr);
            }
          }
        );
      });
    }
  });

  // Tabla de clientes
  // cedula + owner_user_id es la clave (un mismo número podría existir para otro usuario)
  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      cedula TEXT NOT NULL,
      full_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      owner_user_id INTEGER NOT NULL,
      PRIMARY KEY (cedula, owner_user_id),
      FOREIGN KEY (owner_user_id) REFERENCES users(id)
    )
  `);

  // Tabla de préstamos
  db.run(`
    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_cedula TEXT NOT NULL,
      owner_user_id INTEGER NOT NULL,
      principal REAL NOT NULL,
      interest_rate REAL NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      total_amount REAL NOT NULL,
      daily_payment REAL NOT NULL,
      remaining_amount REAL NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES users(id)
    )
  `);

    // Tabla de abonos de préstamos
  db.run(`
    CREATE TABLE IF NOT EXISTS loan_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (loan_id) REFERENCES loans(id)
    )
  `);


  // Crear admin por defecto si no hay usuarios
  db.get(`SELECT COUNT(*) AS count FROM users`, (err, row) => {
    if (err) {
      console.error("Error contando usuarios:", err);
      return;
    }
    if (row.count === 0) {
      db.run(
        `INSERT INTO users (username, password, role, active)
         VALUES (?, ?, ?, 1)`,
        ["admin", "admin123", "admin"],
        (err2) => {
          if (err2) {
            console.error("Error creando admin por defecto:", err2);
          } else {
            console.log("Usuario admin creado: admin / admin123");
          }
        }
      );
    }
  });
});

module.exports = db;
