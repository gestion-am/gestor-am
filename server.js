// server.js
const express = require("express");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

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

// Helper para diferenciar días (para abonos)
// Usamos SOLO la fecha (yyyy-mm-dd) a las 00:00 local, igual que en el front,
// para que NO sume un día de más cuando calcula desde hoy hasta la fecha fin.
function diffDays(from, to) {
  const fromStr = String(from).slice(0, 10); // yyyy-mm-dd
  const toStr   = String(to).slice(0, 10);   // yyyy-mm-dd

  const start = new Date(`${fromStr}T00:00:00`);
  const end   = new Date(`${toStr}T00:00:00`);

  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  // mínimo 1 día para que no quede en 0 si es el mismo día
  return Math.max(1, diff);
}


// ======================
// Rutas de AUTENTICACIÓN
// ======================

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.json({
        ok: false,
        message: "Usuario y contraseña son obligatorios",
      });
    }

    const user = await dbGet(
      `SELECT id, username, password, role, active FROM users WHERE username = ?`,
      [username]
    );

    if (!user || user.password !== password) {
      return res.json({
        ok: false,
        message: "Usuario o contraseña incorrectos",
      });
    }

    if (!user.active) {
      return res.json({
        ok: false,
        message: "Este usuario está inhabilitado",
      });
    }

    return res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role || "user",
      },
    });
  } catch (err) {
    console.error("Error en /api/login:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});

// Cambiar contraseña
app.post("/api/change-password", async (req, res) => {
  try {
    const { userId, newPassword } = req.body || {};
    if (!userId || !newPassword) {
      return res.json({
        ok: false,
        message: "Faltan datos para cambiar la contraseña",
      });
    }

    await dbRun(`UPDATE users SET password = ? WHERE id = ?`, [
      newPassword,
      userId,
    ]);

    return res.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/change-password:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});

// ================
// Rutas de USUARIOS
// ================

// Listar usuarios (lo usará solo el admin desde el front)
app.get("/api/users", async (req, res) => {
  try {
    const users = await dbAll(
      `SELECT id, username, role, active, created_at
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
app.post("/api/users/save", async (req, res) => {
  try {
    const { id, username, password, role } = req.body || {};

    if (!username) {
      return res.json({
        ok: false,
        message: "El nombre de usuario es obligatorio",
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
  // Siempre se crean como activos (active = 1)
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO users (username, password, role, active, created_at)
         VALUES (?, ?, ?, 1, ?)`,
    [username, password, roleValue, now]
  );
} else {
  // En edición, la contraseña es OPCIONAL
  if (password) {
    await dbRun(
      `UPDATE users
       SET username = ?, password = ?, role = ?
       WHERE id = ?`,
      [username, password, roleValue, id]
    );
  } else {
    await dbRun(
      `UPDATE users
       SET username = ?, role = ?
       WHERE id = ?`,
      [username, roleValue, id]
    );
  }
}


    res.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/users/save:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});


app.post("/api/users/toggle", async (req, res) => {
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
app.get("/api/clients", async (req, res) => {
  try {
    const ownerUserId = Number(req.query.ownerUserId || 0);
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
app.post("/api/clients", async (req, res) => {
  try {
    const { cedula, fullName, ownerUserId } = req.body || {};

    if (!cedula || !fullName || !ownerUserId) {
      return res.json({
        ok: false,
        message: "Faltan datos del cliente",
      });
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
app.post("/api/clients/delete", async (req, res) => {
  try {
    const { cedula, ownerUserId } = req.body || {};

    if (!cedula || !ownerUserId) {
      return res.json({
        ok: false,
        message: "Faltan datos para eliminar el cliente",
      });
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
// Rutas de PRÉSTAMOS
// ================

// Listar préstamos de un usuario
app.get("/api/loans", async (req, res) => {
  try {
    const ownerUserId = Number(req.query.ownerUserId || 0);
    if (!ownerUserId) {
      return res.json({
        ok: false,
        message: "ownerUserId es requerido",
      });
    }

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
app.post("/api/loans", async (req, res) => {
  try {
    const {
      clientId,
      ownerUserId,
      principal,
      interestRate,
      startDate,
      endDate,
      totalAmount,
      dailyPayment,
    } = req.body || {};

    if (
      !clientId ||
      !ownerUserId ||
      !principal ||
      !interestRate ||
      !startDate ||
      !endDate ||
      !totalAmount ||
      !dailyPayment
    ) {
      return res.json({
        ok: false,
        message: "Faltan datos del préstamo",
      });
    }

    await dbRun(
      `
      INSERT INTO loans (
        client_cedula,
        owner_user_id,
        principal,
        interest_rate,
        start_date,
        end_date,
        total_amount,
        daily_payment,
        remaining_amount,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
    `,
      [
        clientId,
        ownerUserId,
        principal,
        interestRate,
        startDate,
        endDate,
        totalAmount,
        dailyPayment,
        totalAmount, // remaining_amount inicial
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/loans (POST):", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});

// Abonar a un préstamo
app.post("/api/loans/abonar", async (req, res) => {
  try {
    const { loanId, amount } = req.body || {};
    if (!loanId || !amount) {
      return res.json({
        ok: false,
        message: "Faltan datos para el abono",
      });
    }

    const loan = await dbGet(
      `SELECT * FROM loans WHERE id = ?`,
      [loanId]
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
    let newRemaining = Number(
      (loan.remaining_amount - abono).toFixed(2)
    );

   // Fecha local de hoy (yyyy-mm-dd)
const now = new Date();
const todayStr = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
].join("-");

const remainingDays = diffDays(todayStr, loan.end_date);


    let newDaily = 0;
    let newStatus = "open";

    if (newRemaining <= 0.01 || remainingDays <= 0) {
      newRemaining = 0;
      newDaily = 0;
      newStatus = "closed";
    } else {
      newDaily = Number((newRemaining / remainingDays).toFixed(2));
    }

    // Registrar el abono en la tabla de pagos
    const createdAt = new Date().toISOString(); // con fecha, hora y segundos
    await dbRun(
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

    res.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/loans/abonar:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});

// Obtener abonos de un préstamo
app.get("/api/loans/:loanId/payments", async (req, res) => {
  try {
    const { loanId } = req.params;
    const payments = await dbAll(
      `SELECT id, loan_id, amount, created_at
       FROM loan_payments
       WHERE loan_id = ?
       ORDER BY datetime(created_at) ASC`,
      [loanId]
    );
    res.json({ ok: true, payments });
  } catch (err) {
    console.error("Error en /api/loans/:loanId/payments:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});

// Eliminar abono de un préstamo (solo durante los primeros 5 minutos)
app.delete("/api/payments/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;

    if (!paymentId) {
      return res.json({ ok: false, message: "ID de abono requerido" });
    }

    const payment = await dbGet(
      `SELECT * FROM loan_payments WHERE id = ?`,
      [paymentId]
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
      let newRemaining = Number(
        (loan.remaining_amount + payment.amount).toFixed(2)
      );

     const now = new Date();
const todayStr = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
].join("-");

const remainingDays = diffDays(todayStr, loan.end_date);


      let newDaily = 0;
      let newStatus = loan.status;

      if (newRemaining <= 0.01 || remainingDays <= 0) {
        newRemaining = 0;
        newDaily = 0;
        newStatus = "closed";
      } else {
        newDaily = Number((newRemaining / remainingDays).toFixed(2));
        newStatus = "open";
      }

      await dbRun(
        `
        UPDATE loans
        SET remaining_amount = ?, daily_payment = ?, status = ?
        WHERE id = ?
      `,
        [newRemaining, newDaily, newStatus, loan.id]
      );
    }

    // Borrar el abono
    await dbRun(`DELETE FROM loan_payments WHERE id = ?`, [paymentId]);

    res.json({ ok: true });
  } catch (err) {
    console.error("Error en DELETE /api/payments/:paymentId:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
});


// Eliminar préstamo (solo dentro de los primeros 5 minutos)
app.post("/api/loans/delete", async (req, res) => {
  try {
    const { loanId, ownerUserId } = req.body;

    if (!loanId || !ownerUserId) {
      return res.json({
        ok: false,
        message: "Datos incompletos para eliminar el préstamo.",
      });
    }

    const now = Date.now();

    const loan = await dbGet(
      `SELECT id,
              owner_user_id AS ownerUserId,
              start_date     AS startDate
       FROM loans
       WHERE id = ?`,
      [loanId]
    );

    if (!loan) {
      return res.json({ ok: false, message: "Préstamo no encontrado." });
    }

    if (loan.ownerUserId !== ownerUserId) {
      return res.json({
        ok: false,
        message: "No tienes permiso para eliminar este préstamo.",
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

    await dbRun("DELETE FROM loans WHERE id = ?", [loanId]);

    res.json({ ok: true, message: "Préstamo eliminado correctamente." });
  } catch (error) {
    console.error("Error en /api/loans/delete:", error);
    res.json({
      ok: false,
      message: "Error interno del servidor al eliminar el préstamo.",
    });
  }
});




// Arrancar servidor
app.listen(PORT, () => {
  console.log(`GESTOR-AM escuchando en http://localhost:${PORT}`);
});
