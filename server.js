// gestor-am/server.js

const express = require("express");
const path = require("path");
const db = require("./db");
const crypto = require("crypto");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { promisify } = require("util");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const scryptAsync = promisify(crypto.scrypt);
const HASH_PREFIX = "scrypt";

function isHashedPassword(value) {
  return typeof value === "string" && value.startsWith(`${HASH_PREFIX}$`);
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${HASH_PREFIX}$${salt}$${derivedKey.toString("hex")}`;
}

async function verifyPassword(password, storedValue) {
  if (!isHashedPassword(storedValue)) {
    return password === storedValue;
  }

  const [, salt, storedHash] = storedValue.split("$");
  const derivedKey = await scryptAsync(password, salt, 64);
  const derivedHex = derivedKey.toString("hex");

  const a = Buffer.from(derivedHex, "hex");
  const b = Buffer.from(storedHash, "hex");

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Seguridad básica de Express
app.disable("x-powered-by");

if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

// Middleware
app.use(express.json({ limit: "200kb" }));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
        ],
        fontSrc: [
          "'self'",
          "https:",
          "data:",
          "https://cdnjs.cloudflare.com",
        ],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: IS_PRODUCTION ? [] : null,
      },
    },
    crossOriginResourcePolicy: false,
  })
);

// Límite básico para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    ok: false,
    message: "Demasiados intentos. Inténtalo nuevamente en unos minutos.",
  },
});

// Servir archivos estáticos (tu front)
// Esto permite usar index.html, dashboard.html, css, js, assets, etc.
app.use(express.static(path.join(__dirname)));

// Helpers para usar sqlite con Promesas
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function newToken() {
  return crypto.randomBytes(32).toString("hex");
}


function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this); // this.lastID, this.changes
    });
  });
}

function toCents(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

function fromCents(cents) {
  return Number((cents / 100).toFixed(2));
}

async function registerGeneralMovement({
  ownerUserId,
  sourceType,
  sourceId = null,
  movementType,
  amount,
  description,
  createdAt = new Date().toISOString(),
}) {
  await dbRun(
    `
    INSERT INTO general_movements (
      owner_user_id, source_type, source_id, movement_type, amount, description, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [ownerUserId, sourceType, sourceId, movementType, amount, description, createdAt]
  );
}

async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, code: "NO_TOKEN" });

    const session = await dbGet(
  `SELECT token, user_id, auth_version, last_seen_at FROM user_sessions WHERE token = ?`,
  [token]
);
    if (!session) return res.status(401).json({ ok: false, code: "BAD_SESSION" });

    // ✅ Expiración por inactividad (1 hora)
// Si last_seen_at es más viejo que 1 hora, borramos la sesión y expulsamos
const expired = await dbGet(
  `SELECT 1 AS ok
     FROM user_sessions
    WHERE token = ?
      AND datetime(last_seen_at) > datetime('now','-1 hour')`,
  [token]
);

if (!expired) {
  await dbRun(`DELETE FROM user_sessions WHERE token = ?`, [token]);
  return res.status(401).json({ ok: false, code: "IDLE_TIMEOUT" });
}

    const user = await dbGet(
      `SELECT id, username, role, active, auth_version FROM users WHERE id = ?`,
      [session.user_id]
    );
    if (!user || !user.active) {
      return res.status(401).json({ ok: false, code: "USER_DISABLED" });
    }

    // Si cambió auth_version, esta sesión queda invalidada
    if (Number(user.auth_version) !== Number(session.auth_version)) {
      // opcional: borramos la sesión vieja
      await dbRun(`DELETE FROM user_sessions WHERE token = ?`, [token]);
      return res.status(401).json({ ok: false, code: "SESSION_INVALIDATED" });
    }

    // update last_seen
    await dbRun(`UPDATE user_sessions SET last_seen_at = datetime('now') WHERE token = ?`, [token]);

    req.user = { id: user.id, username: user.username, role: user.role };
    req.token = token;
    next();
  } catch (e) {
    console.error("requireAuth error:", e);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ ok: false, code: "FORBIDDEN" });
  }
  next();
}


function toLocalDateOnly(input) {
  if (!input) return null;

  const s = String(input);

  // Si ya viene como yyyy-mm-dd, lo respetamos tal cual
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Si viene ISO (con hora / Z), lo convertimos a fecha LOCAL real
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    // fallback seguro (por si llega algo raro)
    return s.slice(0, 10);
  }

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Helper para diferenciar días (para abonos) usando FECHA LOCAL REAL
function diffDays(from, to) {
  const fromStr = toLocalDateOnly(from);
  const toStr   = toLocalDateOnly(to);

  const start = new Date(`${fromStr}T00:00:00`);
  const end   = new Date(`${toStr}T00:00:00`);

  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function getTodayStr() {
  // ✅ FECHA LOCAL (yyyy-mm-dd) para que diffDays no se desplace por UTC
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getClientTimezoneOffsetMinutes(req) {
  const raw = req.headers["x-timezone-offset-minutes"];
  const value = Number(raw);

  if (!Number.isFinite(value)) return 0;
  if (value < -840 || value > 840) return 0;

  return Math.trunc(value);
}

function localDateBoundaryToUtcIso(localDate, boundary = "start", offsetMinutes = 0) {
  const safe = String(localDate || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) {
    return null;
  }

  const [year, month, day] = safe.split("-").map(Number);

  const hours = boundary === "end" ? 23 : 0;
  const minutes = boundary === "end" ? 59 : 0;
  const seconds = boundary === "end" ? 59 : 0;
  const millis = boundary === "end" ? 999 : 0;

  const utcMs = Date.UTC(year, month - 1, day, hours, minutes, seconds, millis);

  return new Date(utcMs + offsetMinutes * 60 * 1000).toISOString();
}

function getOffsetDateParts(dateStr, offsetMinutes = 0) {
  const utcMs = new Date(dateStr).getTime();
  if (!Number.isFinite(utcMs)) return null;

  const shifted = new Date(utcMs - offsetMinutes * 60 * 1000);

  return {
    year: shifted.getUTCFullYear(),
    month: String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    day: String(shifted.getUTCDate()).padStart(2, "0"),
  };
}

function toOffsetMonthKey(dateStr, offsetMinutes = 0) {
  const parts = getOffsetDateParts(dateStr, offsetMinutes);
  if (!parts) return null;
  return `${parts.year}-${parts.month}`;
}

function getUtcBoundsForLocalMonth(monthStr, offsetMinutes = 0) {
  const safe = String(monthStr || "").trim();

  if (!/^\d{4}-\d{2}$/.test(safe)) {
    return null;
  }

  const [year, month] = safe.split("-").map(Number);

  const startUtcMs = Date.UTC(year, month - 1, 1, 0, 0, 0, 0);
  const endUtcMs = Date.UTC(year, month, 1, 0, 0, 0, 0);

  return {
    startIso: new Date(startUtcMs + offsetMinutes * 60 * 1000).toISOString(),
    endIso: new Date(endUtcMs + offsetMinutes * 60 * 1000).toISOString(),
  };
}


// ======================
// Rutas de AUTENTICACIÓN

// Login
app.post("/api/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.json({ ok: false, message: "Usuario y contraseña son obligatorios" });
    }

    const user = await dbGet(
      `SELECT id, username, full_name, password, role, active, auth_version FROM users WHERE username = ?`,
      [username]
    );

    if (!user) {
  return res.json({ ok: false, message: "Usuario o contraseña incorrectos" });
}

const passwordOk = await verifyPassword(password, user.password);

if (!passwordOk) {
  return res.json({ ok: false, message: "Usuario o contraseña incorrectos" });
}

// Migración automática: si estaba en texto plano, la convertimos a hash
if (!isHashedPassword(user.password)) {
  const upgradedHash = await hashPassword(password);
  await dbRun(
    `UPDATE users
     SET password = ?, password_updated_at = datetime('now')
     WHERE id = ?`,
    [upgradedHash, user.id]
  );
}

    if (!user.active) {
      return res.json({ ok: false, message: "Este usuario está inhabilitado" });
    }

    // ✅ 1) Cerramos TODAS las sesiones anteriores del usuario (solo 1 sesión viva)
await dbRun(`DELETE FROM user_sessions WHERE user_id = ?`, [user.id]);

// ✅ 2) Creamos la nueva sesión
const token = newToken();

await dbRun(
  `INSERT INTO user_sessions (token, user_id, auth_version)
   VALUES (?, ?, ?)`,
  [token, user.id, Number(user.auth_version)]
);

    return res.json({
      ok: true,
      token, // ✅ importantísimo
      user: {
  id: user.id,
  username: user.username,
  fullName: user.full_name || user.username,
  role: user.role || "user",
},
    });
  } catch (err) {
    console.error("Error en /api/login:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});



// Cambiar contraseña
app.post("/api/change-password", requireAuth, async (req, res) => {
  try {
    const { userId, newPassword } = req.body || {};
    if (!userId || !newPassword) {
      return res.json({ ok: false, message: "Faltan datos para cambiar la contraseña" });
    }

    // Seguridad: solo me puedo cambiar MI contraseña
    if (Number(userId) !== Number(req.user.id)) {
      return res.status(403).json({ ok: false, code: "FORBIDDEN" });
    }

    // ✅ Cambia password + sube auth_version
    const hashedPassword = await hashPassword(newPassword);

await dbRun(
  `UPDATE users
   SET password = ?,
       auth_version = auth_version + 1,
       password_updated_at = datetime('now')
   WHERE id = ?`,
  [hashedPassword, userId]
);

    // ✅ Borra TODAS las sesiones del usuario (incluida la actual)
    await dbRun(`DELETE FROM user_sessions WHERE user_id = ?`, [userId]);

    return res.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/change-password:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});



// ✅ Saber si la sesión sigue válida
app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const user = await dbGet(
      `SELECT id, username, full_name, role
       FROM users
       WHERE id = ?`,
      [req.user.id]
    );

    return res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name || user.username,
        role: user.role || "user",
      },
    });
  } catch (err) {
    console.error("Error en /api/me:", err);
    return res.status(500).json({ ok: false, message: "Error interno" });
  }
});

app.post("/api/logout", requireAuth, async (req, res) => {
  try {
    await dbRun(`DELETE FROM user_sessions WHERE token = ?`, [req.token]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/logout:", err);
    return res.status(500).json({ ok: false, message: "Error interno" });
  }
});


// ================
// Rutas de USUARIOS
// ================

// Listar usuarios (lo usará solo el admin desde el front)
app.get("/api/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await dbAll(
      `SELECT id, username, full_name, role, active, created_at
FROM users
       ORDER BY id ASC`
    );
    res.json({ ok: true, users });
  } catch (err) {
    console.error("Error en /api/users:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});


// Crear / actualizar usuario
app.post("/api/users/save", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id, fullName, username, password, role } = req.body || {};

   if (!fullName || !username) {
  return res.json({
    ok: false,
    message: "El nombre completo y el nombre de usuario son obligatorios",
  });
}

    const roleValue = role || "user";
    const isNew = !id;

    // Para un usuario NUEVO la contraseña sí es obligatoria
    if (isNew && !password) {
      return res.json({
        ok: false,
        message: "La contraseña es obligatoria para un usuario nuevo",
      });
    }

    // -------- validar usuario duplicado --------
    const existing = await dbGet(
      `SELECT id FROM users WHERE username = ? AND (? IS NULL OR id != ?)`,
      [username, id || null, id || null]
    );

    if (existing) {
      return res.json({
        ok: false,
        message: `El usuario "${username}" ya existe. Intenta con otro nombre.`,
      });
    }
    // ------------------------------------------

   if (isNew) {
  const now = new Date().toISOString();
  const hashedPassword = await hashPassword(password);

  await dbRun(
    `INSERT INTO users (username, full_name, password, role, active, created_at)
     VALUES (?, ?, ?, ?, 1, ?)`,
    [username, fullName, hashedPassword, roleValue, now]
  );
} else {
  // En edición, la contraseña es OPCIONAL
  if (password) {
  // ✅ Admin cambia password a otro usuario:
  // 1) cambia password
  // 2) sube auth_version
  // 3) borra sesiones => el usuario queda expulsado “en vivo”
 const hashedPassword = await hashPassword(password);

await dbRun(
  `UPDATE users
   SET username = ?,
       full_name = ?,
       password = ?,
       role = ?,
       auth_version = auth_version + 1,
       password_updated_at = datetime('now')
   WHERE id = ?`,
  [username, fullName, hashedPassword, roleValue, id]
);

  await dbRun(`DELETE FROM user_sessions WHERE user_id = ?`, [id]);
} else {
   await dbRun(
    `UPDATE users
     SET username = ?, full_name = ?, role = ?
     WHERE id = ?`,
    [username, fullName, roleValue, id]
  );
}
}


    res.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/users/save:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});


app.post("/api/users/toggle", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id, currentUserId } = req.body || {};
    if (!id) {
      return res.json({ ok: false, message: "Falta el id del usuario" });
    }

    // Seguridad: no permitir inhabilitarse a sí mismo
    if (currentUserId && Number(id) === Number(currentUserId)) {
      return res.json({
        ok: false,
        message: "No puedes inhabilitar tu propio usuario.",
      });
    }

    const user = await dbGet(`SELECT active FROM users WHERE id = ?`, [id]);
    if (!user) {
      return res.json({ ok: false, message: "Usuario no encontrado" });
    }

    const newActive = user.active ? 0 : 1;
    await dbRun(`UPDATE users SET active = ? WHERE id = ?`, [newActive, id]);

    res.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/users/toggle:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});


// ================
// Rutas de CLIENTES
// ================

// Listar clientes de un usuario
app.get("/api/clients", requireAuth, async (req, res) => {
  try {
    const ownerUserId = Number(req.user.id);
    if (!ownerUserId) {
      return res.json({
        ok: false,
        message: "ownerUserId es requerido",
      });
    }

    const rows = await dbAll(
      `
      SELECT cedula, full_name, created_at
      FROM clients
      WHERE owner_user_id = ?
      ORDER BY created_at DESC
    `,
      [ownerUserId]
    );

    const clients = rows.map((r) => ({
      id: r.cedula,
      fullName: r.full_name,
      createdAt: r.created_at,
    }));

    res.json({ ok: true, clients });
  } catch (err) {
    console.error("Error en /api/clients:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});

// Crear cliente
// Crear cliente
app.post("/api/clients", requireAuth, async (req, res) => {
  try {
    const { cedula, fullName } = req.body || {};
    const ownerUserId = Number(req.user.id); // ✅ del token

    if (!cedula || !fullName) {
      return res.json({ ok: false, message: "Faltan datos del cliente" });
    }

    // -------- validar cédula duplicada para ese usuario --------
    const existing = await dbGet(
      `SELECT cedula 
         FROM clients 
        WHERE cedula = ? AND owner_user_id = ?`,
      [cedula, ownerUserId]
    );

    if (existing) {
      return res.json({
        ok: false,
        message: `El cliente con cédula "${cedula}" ya existe. Intenta con otra cédula.`,
      });
    }
    // -----------------------------------------------------------

    const now = new Date().toISOString();

    await dbRun(
      `
      INSERT INTO clients (cedula, full_name, created_at, owner_user_id)
      VALUES (?, ?, ?, ?)
    `,
      [cedula, fullName, now, ownerUserId]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/clients (POST):", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});




// Eliminar cliente (solo si no tiene préstamos)
app.post("/api/clients/delete", requireAuth, async (req, res) => {
  try {
    const { cedula } = req.body || {};
    const ownerUserId = Number(req.user.id);

    if (!cedula) {
      return res.json({ ok: false, message: "Faltan datos para eliminar el cliente" });
    }

    // Verificar si tiene préstamos (abiertos o cerrados)
    const loan = await dbGet(
      `SELECT id FROM loans WHERE client_cedula = ? AND owner_user_id = ? LIMIT 1`,
      [cedula, ownerUserId]
    );

    if (loan) {
      return res.json({
        ok: false,
        message:
          "No se puede eliminar el cliente porque tiene préstamos registrados.",
      });
    }

    const result = await dbRun(
      `DELETE FROM clients WHERE cedula = ? AND owner_user_id = ?`,
      [cedula, ownerUserId]
    );

    if (!result.changes) {
      return res.json({
        ok: false,
        message: "Cliente no encontrado.",
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/clients/delete:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});


// ================
// Rutas de CAJA CHICA
// ================

// Listar movimientos de caja chica
app.get("/api/cashbox", requireAuth, async (req, res) => {
  try {
    const ownerUserId = Number(req.user.id);
const { startDate, endDate } = req.query || {};
const tzOffsetMinutes = getClientTimezoneOffsetMinutes(req);

const params = [ownerUserId];
let whereExtra = "";

if (startDate) {
  const startUtcIso = localDateBoundaryToUtcIso(startDate, "start", tzOffsetMinutes);
  if (startUtcIso) {
    whereExtra += ` AND datetime(created_at) >= datetime(?)`;
    params.push(startUtcIso);
  }
}

if (endDate) {
  const endUtcIso = localDateBoundaryToUtcIso(endDate, "end", tzOffsetMinutes);
  if (endUtcIso) {
    whereExtra += ` AND datetime(created_at) <= datetime(?)`;
    params.push(endUtcIso);
  }
}

    const rows = await dbAll(
      `
      SELECT id, type, amount, description, created_at
      FROM cash_box_movements
      WHERE owner_user_id = ?
      ${whereExtra}
      ORDER BY datetime(created_at) DESC, id DESC
      `,
      params
    );

    const movements = rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: row.amount,
      description: row.description || "",
      createdAt: row.created_at,
    }));

    res.json({ ok: true, movements });
  } catch (err) {
    console.error("Error en /api/cashbox:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});

// Crear movimiento de caja chica
app.post("/api/cashbox", requireAuth, async (req, res) => {
  try {
    const ownerUserId = Number(req.user.id);
    const { type, amount, description } = req.body || {};

    if (!type || !["ingreso", "prestamo"].includes(type)) {
      return res.json({ ok: false, message: "Tipo de movimiento inválido." });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.json({ ok: false, message: "Ingresa una cantidad válida." });
    }

    const cleanDescription =
      typeof description === "string" ? description.trim() : "";

    const createdAt = new Date().toISOString();

    const result = await dbRun(
  `
  INSERT INTO cash_box_movements (
    owner_user_id, type, amount, description, created_at
  )
  VALUES (?, ?, ?, ?, ?)
  `,
  [ownerUserId, type, numericAmount, cleanDescription, createdAt]
);

await registerGeneralMovement({
  ownerUserId,
  sourceType: "cashbox",
  sourceId: result.lastID,
  movementType: type === "ingreso" ? "credit" : "debit",
  amount: numericAmount,
  description: cleanDescription || (type === "ingreso" ? "Ingreso de caja chica" : "Préstamo de caja chica"),
  createdAt,
});

res.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/cashbox (POST):", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});

// Eliminar movimiento de caja chica (solo durante 5 minutos)
app.delete("/api/cashbox/:movementId", requireAuth, async (req, res) => {
  try {
    const ownerUserId = Number(req.user.id);
    const { movementId } = req.params;

    if (!movementId) {
      return res.json({ ok: false, message: "ID de movimiento requerido." });
    }

    const movement = await dbGet(
      `
      SELECT id, created_at
      FROM cash_box_movements
      WHERE id = ? AND owner_user_id = ?
      `,
      [movementId, ownerUserId]
    );

    if (!movement) {
      return res.json({ ok: false, message: "Movimiento no encontrado." });
    }

    const createdMs = new Date(movement.created_at).getTime();
    const diffMs = Date.now() - createdMs;

    if (diffMs > 5 * 60 * 1000) {
      return res.json({
        ok: false,
        message:
          "No se puede eliminar este movimiento. El tiempo de eliminación (5 minutos) ya expiró.",
      });
    }

    await dbRun(
  `DELETE FROM cash_box_movements WHERE id = ? AND owner_user_id = ?`,
  [movementId, ownerUserId]
);

await dbRun(
  `DELETE FROM general_movements
   WHERE owner_user_id = ?
     AND source_type = 'cashbox'
     AND source_id = ?`,
  [ownerUserId, movementId]
);

res.json({ ok: true });
  } catch (err) {
    console.error("Error en DELETE /api/cashbox/:movementId:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});

// ================
// Rutas de MOVIMIENTOS
// ================

app.get("/api/movements", requireAuth, async (req, res) => {
  try {
  const ownerUserId = Number(req.user.id);
const { startDate, endDate, cursorMonth } = req.query || {};
const tzOffsetMinutes = getClientTimezoneOffsetMinutes(req);

    let rangeStartIso = null;
    let rangeEndIso = null;
    let nextCursorMonth = null;
    let pagingMode = false;

   if (startDate || endDate) {
  const safeStart = startDate
    ? localDateBoundaryToUtcIso(startDate, "start", tzOffsetMinutes)
    : "1970-01-01T00:00:00.000Z";

  const safeEnd = endDate
    ? localDateBoundaryToUtcIso(endDate, "end", tzOffsetMinutes)
    : "2999-12-31T23:59:59.999Z";

  rangeStartIso = safeStart;
  rangeEndIso = safeEnd;
} else {
      pagingMode = true;

      let targetMonth = cursorMonth;

      if (!targetMonth) {
  const latestRow = await dbGet(
    `
    SELECT created_at
    FROM general_movements
    WHERE owner_user_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 1
    `,
    [ownerUserId]
  );

  if (latestRow?.created_at) {
    targetMonth = toOffsetMonthKey(latestRow.created_at, tzOffsetMinutes);
  } else {
          return res.json({
            ok: true,
            movements: [],
            nextCursorMonth: null,
            pagingMode: true,
          });
        }
      }

      const monthBounds = getUtcBoundsForLocalMonth(targetMonth, tzOffsetMinutes);

if (!monthBounds) {
  return res.json({
    ok: true,
    movements: [],
    nextCursorMonth: null,
    pagingMode: true,
  });
}

rangeStartIso = monthBounds.startIso;
rangeEndIso = monthBounds.endIso;

      const previousRow = await dbGet(
        `
        SELECT created_at
        FROM general_movements
        WHERE owner_user_id = ?
          AND datetime(created_at) < datetime(?)
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 1
        `,
        [ownerUserId, rangeStartIso]
      );

      nextCursorMonth = previousRow?.created_at
  ? toOffsetMonthKey(previousRow.created_at, tzOffsetMinutes)
  : null;
    }

    const baseRow = await dbGet(
      `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN movement_type = 'credit' THEN amount
            ELSE -amount
          END
        ), 0) AS balance_before
      FROM general_movements
      WHERE owner_user_id = ?
        AND datetime(created_at) < datetime(?)
      `,
      [ownerUserId, rangeStartIso]
    );

    let runningBalance = Number(baseRow?.balance_before || 0);

    const rows = await dbAll(
      `
      SELECT
        gm.id,
        gm.source_type,
        gm.source_id,
        gm.movement_type,
        gm.amount,
        gm.description,
        gm.created_at,
        COALESCE(c_loan.full_name, c_payment.full_name) AS client_full_name

      FROM general_movements gm

      LEFT JOIN loans l_loan
        ON gm.source_type = 'loan'
       AND gm.source_id = l_loan.id
       AND l_loan.owner_user_id = gm.owner_user_id

      LEFT JOIN clients c_loan
        ON c_loan.cedula = l_loan.client_cedula
       AND c_loan.owner_user_id = gm.owner_user_id

      LEFT JOIN loan_payments lp
        ON gm.source_type = 'loan_payment'
       AND gm.source_id = lp.id

      LEFT JOIN loans l_payment
        ON l_payment.id = lp.loan_id
       AND l_payment.owner_user_id = gm.owner_user_id

      LEFT JOIN clients c_payment
        ON c_payment.cedula = l_payment.client_cedula
       AND c_payment.owner_user_id = gm.owner_user_id

      WHERE gm.owner_user_id = ?
        AND datetime(gm.created_at) >= datetime(?)
        AND datetime(gm.created_at) <= datetime(?)

      ORDER BY datetime(gm.created_at) ASC, gm.id ASC
      `,
      [ownerUserId, rangeStartIso, rangeEndIso]
    );

    const movements = rows.map((row) => {
      const signedAmount =
        row.movement_type === "credit"
          ? Number(row.amount)
          : -Number(row.amount);

      runningBalance = Number((runningBalance + signedAmount).toFixed(2));

      return {
        id: row.id,
        sourceType: row.source_type,
        sourceId: row.source_id,
        movementType: row.movement_type,
        amount: Number(row.amount),
        signedAmount,
        description: row.description,
        clientFullName: row.client_full_name || "",
        createdAt: row.created_at,
        balance: runningBalance,
      };
    });

    return res.json({
      ok: true,
      movements,
      nextCursorMonth,
      pagingMode,
    });
  } catch (err) {
    console.error("Error en /api/movements:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});

// ================
// Rutas de PRÉSTAMOS
// ================

// Listar préstamos de un usuario
app.get("/api/loans", requireAuth, async (req, res) => {
  try {
    const ownerUserId = Number(req.user.id);

    const rows = await dbAll(
      `
      SELECT id, client_cedula, principal, interest_rate, start_date, end_date,
             total_amount, daily_payment, remaining_amount, status
      FROM loans
      WHERE owner_user_id = ?
      ORDER BY id DESC
      `,
      [ownerUserId]
    );

    const loans = rows.map((r) => ({
      id: r.id,
      clientId: r.client_cedula,
      principal: r.principal,
      interestRate: r.interest_rate,
      startDate: r.start_date,
      endDate: r.end_date,
      totalAmount: r.total_amount,
      dailyPayment: r.daily_payment,
      remainingAmount: r.remaining_amount,
      status: r.status,
    }));

    res.json({ ok: true, loans });
  } catch (err) {
    console.error("Error en /api/loans:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});

// Crear préstamo
app.post("/api/loans", requireAuth, async (req, res) => {
  try {
    const ownerUserId = Number(req.user.id);
    const { clientId, principal, interestRate, startDate, endDate, totalAmount, dailyPayment } = req.body || {};

    if (!clientId || !principal || !interestRate || !startDate || !endDate || !totalAmount || !dailyPayment) {
      return res.json({ ok: false, message: "Faltan datos del préstamo" });
    }

    const result = await dbRun(
  `
  INSERT INTO loans (
    client_cedula, owner_user_id, principal, interest_rate,
    start_date, end_date, total_amount, daily_payment,
    remaining_amount, status
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
  `,
  [clientId, ownerUserId, principal, interestRate, startDate, endDate, totalAmount, dailyPayment, totalAmount]
);

await registerGeneralMovement({
  ownerUserId,
  sourceType: "loan",
  sourceId: result.lastID,
  movementType: "debit",
  amount: Number(principal),
  description: `Préstamo realizado al cliente ${clientId}`,
  createdAt: startDate,
});

res.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/loans (POST):", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});

// Abonar a un préstamo
app.post("/api/loans/abonar", requireAuth, async (req, res) => {
  try {
    const { loanId, amount } = req.body || {};
    if (!loanId || !amount) {
      return res.json({
        ok: false,
        message: "Faltan datos para el abono",
      });
    }

    const loan = await dbGet(
  `SELECT * FROM loans WHERE id = ? AND owner_user_id = ?`,
  [loanId, Number(req.user.id)]
);

    if (!loan) {
      return res.json({
        ok: false,
        message: "Préstamo no encontrado",
      });
    }

    if (loan.status !== "open") {
      return res.json({
        ok: false,
        message: "Este préstamo ya está finalizado",
      });
    }

    const abono = Number(amount);
    if (!Number.isFinite(abono) || abono <= 0) {
      return res.json({ ok: false, message: "Valor de abono inválido" });
    }

    if (abono > loan.remaining_amount) {
      return res.json({
        ok: false,
        message: "El abono no puede ser mayor al saldo pendiente",
      });
    }

    // Nuevo saldo
    // ✅ trabajamos en centavos para no perder precisión
let newRemainingCents = toCents(loan.remaining_amount) - toCents(abono);

const todayStr = getTodayStr();
const remainingDays = diffDays(todayStr, loan.end_date);

let newDaily = 0;
let newStatus = "open";

// ✅ SOLO se cierra cuando la deuda llega a 0
if (newRemainingCents <= 1) {
  newRemainingCents = 0;
  newDaily = 0;
  newStatus = "closed";
} else {
  if (remainingDays > 0) {
    // ✅ No vencido: recalcular por días restantes
    const safeDays = Math.max(1, remainingDays);
    const dailyCents = Math.round(newRemainingCents / safeDays);
    newDaily = fromCents(dailyCents);
  } else {
    // ✅ Vencido: recalcular al “valor correcto” => saldo completo pendiente
    newDaily = fromCents(newRemainingCents);
  }
}

const newRemaining = fromCents(newRemainingCents);


    // Registrar el abono en la tabla de pagos
    const createdAt = new Date().toISOString(); // con fecha, hora y segundos
    const paymentInsert = await dbRun(
  `
  INSERT INTO loan_payments (loan_id, amount, created_at)
  VALUES (?, ?, ?)
`,
  [loanId, abono, createdAt]
);

    // Actualizar el préstamo
    await dbRun(
      `
      UPDATE loans
      SET remaining_amount = ?, daily_payment = ?, status = ?
      WHERE id = ?
    `,
      [newRemaining, newDaily, newStatus, loanId]
    );

   await registerGeneralMovement({
  ownerUserId: Number(req.user.id),
  sourceType: "loan_payment",
  sourceId: paymentInsert.lastID,
  movementType: "credit",
  amount: Number(abono),
  description: `Abono del cliente ${loan.client_cedula}`,
  createdAt,
});

    res.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/loans/abonar:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});

// Obtener abonos de un préstamo
app.get("/api/loans/:loanId/payments", requireAuth, async (req, res) => {
  try {
    const { loanId } = req.params;
const ownerUserId = Number(req.user.id);

// ✅ Solo traer pagos si el préstamo pertenece al usuario logueado
const payments = await dbAll(
  `SELECT p.id, p.loan_id, p.amount, p.created_at
     FROM loan_payments p
     JOIN loans l ON l.id = p.loan_id
    WHERE p.loan_id = ?
      AND l.owner_user_id = ?
    ORDER BY datetime(p.created_at) ASC`,
  [loanId, ownerUserId]
);

res.json({ ok: true, payments });
  } catch (err) {
    console.error("Error en /api/loans/:loanId/payments:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});

// Eliminar abono de un préstamo (solo durante los primeros 5 minutos)
app.delete("/api/payments/:paymentId", requireAuth, async (req, res) => {
  try {
    const { paymentId } = req.params;

    if (!paymentId) {
      return res.json({ ok: false, message: "ID de abono requerido" });
    }

    const ownerUserId = Number(req.user.id);

// ✅ Trae el pago solo si pertenece a un préstamo del usuario logueado
const payment = await dbGet(
  `SELECT p.*
     FROM loan_payments p
     JOIN loans l ON l.id = p.loan_id
    WHERE p.id = ?
      AND l.owner_user_id = ?`,
  [paymentId, ownerUserId]
);
    if (!payment) {
      return res.json({ ok: false, message: "Abono no encontrado" });
    }

    // Validar ventana de 5 minutos
    const createdMs = new Date(payment.created_at).getTime();
    const diffMs = Date.now() - createdMs;
    if (diffMs > 5 * 60 * 1000) {
      return res.json({
        ok: false,
        message:
          "Solo puedes eliminar un abono durante los primeros 5 minutos después de registrarlo.",
      });
    }

    // Recuperar préstamo y recalcular
    const loan = await dbGet(
      `SELECT * FROM loans WHERE id = ?`,
      [payment.loan_id]
    );

 if (loan) {
  // ✅ Recalcular de forma segura al eliminar:
  // nuevo saldo = saldo actual + el abono eliminado (en centavos)
  let newRemainingCents =
    toCents(loan.remaining_amount) + toCents(payment.amount);

  // ✅ Clamp: nunca pasar del total (por si algo quedó raro antes)
  const totalCents = toCents(loan.total_amount);
  if (newRemainingCents > totalCents) newRemainingCents = totalCents;

  const todayStr = getTodayStr();
  const remainingDays = diffDays(todayStr, loan.end_date);

  let newDaily = 0;
  let newStatus = "open";

  // ✅ SOLO se cierra si ya no debe nada
  if (newRemainingCents <= 1) {
    newRemainingCents = 0;
    newDaily = 0;
    newStatus = "closed";
  } else {
    // ✅ Si NO está vencido: recalcular por días restantes
    if (remainingDays > 0) {
      const safeDays = Math.max(1, remainingDays);
      const dailyCents = Math.round(newRemainingCents / safeDays);
      newDaily = fromCents(dailyCents);
    } else {
      // ✅ Si está vencido: el “pago diario” es TODO el saldo pendiente
      newDaily = fromCents(newRemainingCents);
    }
  }

  const newRemaining = fromCents(newRemainingCents);

  await dbRun(
    `
    UPDATE loans
    SET remaining_amount = ?, daily_payment = ?, status = ?
    WHERE id = ?
    `,
    [newRemaining, newDaily, newStatus, loan.id]
  );
}

// ✅ borrar el movimiento del ledger ligado a este abono
await dbRun(
  `DELETE FROM general_movements
   WHERE owner_user_id = ?
     AND source_type = 'loan_payment'
     AND source_id = ?`,
  [ownerUserId, paymentId]
);

// compatibilidad por si algunos abonos viejos quedaron guardados con source_id = loan_id
await dbRun(
  `DELETE FROM general_movements
   WHERE owner_user_id = ?
     AND source_type = 'loan_payment'
     AND source_id = ?
     AND amount = ?
     AND created_at = ?`,
  [ownerUserId, payment.loan_id, payment.amount, payment.created_at]
);

// ✅ ahora sí, borramos el abono
await dbRun(`DELETE FROM loan_payments WHERE id = ?`, [paymentId]);

res.json({ ok: true });
  } catch (err) {
    console.error("Error en DELETE /api/payments/:paymentId:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});


// Eliminar préstamo (solo dentro de los primeros 5 minutos)
app.post("/api/loans/delete", requireAuth, async (req, res) => {
  try {
    const { loanId } = req.body;
    const ownerUserId = Number(req.user.id); // ✅ SIEMPRE desde el token

    if (!loanId) {
      return res.json({
        ok: false,
        message: "Datos incompletos para eliminar el préstamo.",
      });
    }

    const now = Date.now();

    // ✅ Traer el préstamo SOLO si pertenece al usuario logueado
    const loan = await dbGet(
      `SELECT id,
              owner_user_id AS ownerUserId,
              start_date     AS startDate
       FROM loans
       WHERE id = ?
         AND owner_user_id = ?`,
      [loanId, ownerUserId]
    );

    if (!loan) {
      return res.json({
        ok: false,
        message: "Préstamo no encontrado o no tienes permiso para eliminarlo.",
      });
    }

    const startDateMs = new Date(loan.startDate).getTime();
    if (!Number.isFinite(startDateMs)) {
      return res.json({
        ok: false,
        message:
          "La fecha de inicio del préstamo es inválida. No se puede eliminar.",
      });
    }

    const diffMs = now - startDateMs;
    const FIVE_MINUTES = 5 * 60 * 1000;
    if (diffMs > FIVE_MINUTES) {
      return res.json({
        ok: false,
        message:
          "No se puede eliminar este registro (tiempo límite excedido).",
      });
    }

// ✅ borrar también movimientos del ledger relacionados al préstamo
await dbRun(
  `DELETE FROM general_movements
   WHERE owner_user_id = ?
     AND (
       (source_type = 'loan' AND source_id = ?)
       OR
       (source_type = 'loan_payment' AND source_id IN (
         SELECT id FROM loan_payments WHERE loan_id = ?
       ))
     )`,
  [ownerUserId, loanId, loanId]
);

// compatibilidad con registros viejos de loan_payment mal guardados con source_id = loanId
await dbRun(
  `DELETE FROM general_movements
   WHERE owner_user_id = ?
     AND source_type = 'loan_payment'
     AND source_id = ?`,
  [ownerUserId, loanId]
);

// ✅ Primero borrar abonos del préstamo
await dbRun("DELETE FROM loan_payments WHERE loan_id = ?", [loanId]);

// ✅ Luego borrar el préstamo
await dbRun("DELETE FROM loans WHERE id = ? AND owner_user_id = ?", [
  loanId,
  ownerUserId,
]);

res.json({ ok: true, message: "Préstamo eliminado correctamente." });
  } catch (error) {
    console.error("Error en /api/loans/delete:", error);
    res.json({
      ok: false,
      message: "Error interno del servidor al eliminar el préstamo.",
    });
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});


// Arrancar servidor
app.listen(PORT, () => {
  console.log(`GESTOR-AM escuchando en puerto ${PORT}`);
});
