// gestor-am/db.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// El archivo de base de datos se guardará como gestor-am.db en la raíz
const dbPath = path.join(__dirname, "gestor-am.db");
const db = new sqlite3.Database(dbPath);

db.run("PRAGMA foreign_keys = ON");

// Crear tablas y usuario admin por defecto
db.serialize(() => {
  // Tabla de usuarios
  db.run(`
  CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  auth_version INTEGER NOT NULL DEFAULT 0,
  password_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
  `);

    db.all(`PRAGMA table_info(users)`, (err, columns) => {
    if (err) {
      console.error("Error leyendo esquema de users:", err);
      return;
    }

    const hasFullName = columns.some((col) => col.name === "full_name");

    if (!hasFullName) {
      db.run(`ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT ''`, (alterErr) => {
        if (alterErr) {
          console.error("Error agregando columna full_name:", alterErr);
          return;
        }

        db.run(
          `UPDATE users
           SET full_name = username
           WHERE full_name IS NULL OR full_name = ''`,
          (updateErr) => {
            if (updateErr) {
              console.error("Error rellenando full_name:", updateErr);
            }
          }
        );
      });
    }
  });

  db.run(`
  CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    auth_version INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
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

    // Tabla de caja chica
  db.run(`
    CREATE TABLE IF NOT EXISTS cash_box_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES users(id)
    )
  `);

    // Tabla de movimientos generales (ledger)
  db.run(`
    CREATE TABLE IF NOT EXISTS general_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER,
      movement_type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES users(id)
    )
  `);

    db.run(`
    CREATE INDEX IF NOT EXISTS idx_general_movements_owner_created_at
    ON general_movements(owner_user_id, created_at)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_cash_box_movements_owner_created_at
    ON cash_box_movements(owner_user_id, created_at)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_loans_owner_created_at
    ON loans(owner_user_id, start_date)
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
