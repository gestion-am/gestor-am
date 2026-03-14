// gestor-am/js/app.js

// CONFIGURACIÓN Y UTILIDADES


const SESSION_KEY = "gestor_am_session";
const DEFAULT_INTEREST_RATE = 10;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const CALENDAR_VIEWPORT_MARGIN_PX = 12;
const CALENDAR_GAP_PX = 8;
const CALENDAR_TAP_SHIELD_MS = 220;
let CURRENT_SESSION = null;

// --- helpers de sesión (solo en el navegador) ---

function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setSession(session) {
  if (!session) {
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}

// --- helpers de API ---

function getBrowserTimezoneOffsetMinutes() {
  return String(new Date().getTimezoneOffset());
}

function authHeader() {
  const s = CURRENT_SESSION || getSession();

  const baseHeaders = {
    "X-Timezone-Offset-Minutes": getBrowserTimezoneOffsetMinutes(),
  };

  if (!s || !s.token) return baseHeaders;

  return {
    ...baseHeaders,
    Authorization: `Bearer ${s.token}`,
  };
}

function saveLoginToast(message, type = "success") {
  sessionStorage.setItem(
    "gestor_am_login_toast",
    JSON.stringify({ message, type })
  );
}

function forceLogoutWithToast(message) {
  setSession(null);
  saveLoginToast(message, "error");
  window.location.href = "index.html";
}

async function apiFetch(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
    ...authHeader(),
  };

  const res = await fetch(path, { ...options, headers });

  // Si el server dice 401, cerramos sesión y explicamos
  if (res.status === 401) {
    let data = null;
    try { data = await res.json(); } catch {}

    const code = data && data.code ? data.code : "UNAUTHORIZED";

    if (code === "SESSION_INVALIDATED") {
      forceLogoutWithToast("Tu sesión fue cerrada porque tu contraseña fue cambiada.");
      return { ok: false, code };
    }

    if (code === "IDLE_TIMEOUT") {
  forceLogoutWithToast("Tu sesión se cerró por inactividad (1 hora).");
  return { ok: false, code };
}

    if (code === "USER_DISABLED") {
      forceLogoutWithToast("Tu sesión fue cerrada: Tu usuario fue inhabilitado.");
      return { ok: false, code };
    }

    forceLogoutWithToast("Tu sesión expiró. Inicia sesión nuevamente.");
    return { ok: false, code };
  }

  // normales
  try {
    return await res.json();
  } catch {
    return { ok: false, message: "Respuesta inválida del servidor" };
  }
}

async function apiGet(path) {
  return apiFetch(path, { method: "GET" });
}

async function apiPost(path, data) {
  return apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {}),
  });
}

async function apiDelete(path) {
  return apiFetch(path, { method: "DELETE" });
}

// --- helpers varios del front ---

function formatDateTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");

  // 24h -> 07/11/2025 13:24:17
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

// Devuelve la fecha local en formato yyyy-mm-dd (sin problemas de zona horaria)
function getLocalDateOnly(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}


function formatDateYYYYMMDD(date = new Date()) {
  return getLocalDateOnly(date);
}

function isWithinTimeWindow(dateStr, windowMs = FIVE_MINUTES_MS) {
  const createdMs = new Date(dateStr).getTime();
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() - createdMs <= windowMs;
}

function getRemainingTimeWindowMs(dateStr, windowMs = FIVE_MINUTES_MS) {
  const createdMs = new Date(dateStr).getTime();
  if (!Number.isFinite(createdMs)) return null;
  return createdMs + windowMs - Date.now();
}

function consumeUiEvent(event) {
  if (!event) return;
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
}

function bindCalendarSurface(calendarEl) {
  if (!calendarEl || calendarEl.dataset.surfaceBound === "1") return;

  const stopPropagation = (event) => {
    event.stopPropagation();
  };

  calendarEl.addEventListener("pointerdown", stopPropagation);
  calendarEl.addEventListener("mousedown", stopPropagation);
  calendarEl.addEventListener("touchstart", stopPropagation, { passive: true });
  calendarEl.addEventListener("click", stopPropagation);
  calendarEl.dataset.surfaceBound = "1";
}

function hideCalendarPopover(calendarEl) {
  if (!calendarEl) return;
  calendarEl.classList.add("hidden");
  [
    "position",
    "left",
    "top",
    "width",
    "maxWidth",
    "maxHeight",
    "zIndex",
    "visibility",
  ].forEach((prop) => calendarEl.style.removeProperty(prop));
}

function positionCalendarPopover(calendarEl, anchorEl) {
  if (!calendarEl || !anchorEl) return;

  bindCalendarSurface(calendarEl);

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const anchorRect = anchorEl.getBoundingClientRect();
  const preferredWidth = Math.min(
    Math.max(anchorRect.width, 280),
    viewportWidth - CALENDAR_VIEWPORT_MARGIN_PX * 2
  );

  calendarEl.style.position = "fixed";
  calendarEl.style.left = `${CALENDAR_VIEWPORT_MARGIN_PX}px`;
  calendarEl.style.top = `${CALENDAR_VIEWPORT_MARGIN_PX}px`;
  calendarEl.style.width = `${preferredWidth}px`;
  calendarEl.style.maxWidth = `${viewportWidth - CALENDAR_VIEWPORT_MARGIN_PX * 2}px`;
  calendarEl.style.maxHeight = `${viewportHeight - CALENDAR_VIEWPORT_MARGIN_PX * 2}px`;
  calendarEl.style.zIndex = "260";
  calendarEl.style.visibility = "hidden";

  const calendarRect = calendarEl.getBoundingClientRect();
  const width = Math.min(
    calendarRect.width || preferredWidth,
    viewportWidth - CALENDAR_VIEWPORT_MARGIN_PX * 2
  );
  const height = Math.min(
    calendarRect.height || 0,
    viewportHeight - CALENDAR_VIEWPORT_MARGIN_PX * 2
  );

  let left = anchorRect.left;
  if (left + width > viewportWidth - CALENDAR_VIEWPORT_MARGIN_PX) {
    left = viewportWidth - width - CALENDAR_VIEWPORT_MARGIN_PX;
  }
  if (left < CALENDAR_VIEWPORT_MARGIN_PX) {
    left = CALENDAR_VIEWPORT_MARGIN_PX;
  }

  let top = anchorRect.bottom + CALENDAR_GAP_PX;
  if (top + height > viewportHeight - CALENDAR_VIEWPORT_MARGIN_PX) {
    top = anchorRect.top - height - CALENDAR_GAP_PX;
  }
  if (top < CALENDAR_VIEWPORT_MARGIN_PX) {
    top = CALENDAR_VIEWPORT_MARGIN_PX;
  }

  calendarEl.style.left = `${Math.round(left)}px`;
  calendarEl.style.top = `${Math.round(top)}px`;
  calendarEl.style.visibility = "visible";
}

let calendarRepositionScheduled = false;

function scheduleVisibleCalendarReposition() {
  if (calendarRepositionScheduled) return;
  calendarRepositionScheduled = true;

  requestAnimationFrame(() => {
    calendarRepositionScheduled = false;

    document.querySelectorAll(".loan-calendar:not(.hidden)").forEach((calendarEl) => {
      const anchorId = calendarEl.dataset.anchorId;
      if (!anchorId) return;

      const anchorEl = document.getElementById(anchorId);
      if (!anchorEl) return;

      positionCalendarPopover(calendarEl, anchorEl);
    });
  });
}

function showCalendarPopover(calendarEl, anchorEl, calendarInstance) {
  if (!calendarEl || !anchorEl) return;

  if (anchorEl.id) {
    calendarEl.dataset.anchorId = anchorEl.id;
  }

  calendarEl.classList.remove("hidden");

  requestAnimationFrame(() => {
    if (calendarInstance) {
      calendarInstance.render();
      calendarInstance.updateSize();
    }

    positionCalendarPopover(calendarEl, anchorEl);
  });
}

let calendarTapShieldTimeoutId = null;

function ensureCalendarTapShield() {
  let shield = document.getElementById("calendar-tap-shield");
  if (shield) return shield;

  shield = document.createElement("div");
  shield.id = "calendar-tap-shield";
  shield.className = "calendar-tap-shield hidden";
  shield.setAttribute("aria-hidden", "true");

  const stopShieldEvent = (event) => consumeUiEvent(event);
  shield.addEventListener("pointerdown", stopShieldEvent);
  shield.addEventListener("mousedown", stopShieldEvent);
  shield.addEventListener("touchstart", stopShieldEvent, { passive: false });
  shield.addEventListener("click", stopShieldEvent);

  document.body.appendChild(shield);
  return shield;
}

function activateCalendarTapShield() {
  if (!document.body) return;

  const shield = ensureCalendarTapShield();
  shield.classList.remove("hidden");

  if (calendarTapShieldTimeoutId) {
    window.clearTimeout(calendarTapShieldTimeoutId);
  }

  calendarTapShieldTimeoutId = window.setTimeout(() => {
    shield.classList.add("hidden");
  }, CALENDAR_TAP_SHIELD_MS);
}

function dismissCalendarAfterSelection(hideFn) {
  activateCalendarTapShield();
  window.setTimeout(hideFn, 0);
}

window.addEventListener("resize", scheduleVisibleCalendarReposition);
window.addEventListener("orientationchange", scheduleVisibleCalendarReposition);
window.addEventListener("scroll", scheduleVisibleCalendarReposition, true);

function getLocalDateKey(dateStr) {
  if (!dateStr) return "";

  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) {
    return String(dateStr).slice(0, 10);
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}



// Helper para diferenciar días (para abonos) SIN contar el mismo día y usando fecha local
function diffDays(from, to) {
  const fromStr = String(from).slice(0, 10);
  const toStr = String(to).slice(0, 10);

  const start = new Date(`${fromStr}T00:00:00`);
  const end = new Date(`${toStr}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;

  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 1);

  let chargeableDays = 0;

  while (cursor <= end) {
    if (cursor.getDay() !== 0) {
      chargeableDays += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return Math.max(1, chargeableDays);
}

function getInitialsFromUsername(username) {
  if (!username) return "US";
  const clean = username.trim();
  if (!clean) return "US";
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length === 1) {
    return clean.slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) {
    console.log(message);
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${
    type === "error" ? "toast-error" : "toast-success"
  }`;
  toast.textContent = message;

  container.appendChild(toast);

  // Para activar la animación
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  // Quitar el toast después de unos segundos
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      if (toast.parentNode === container) {
        container.removeChild(toast);
      }
    }, 250);
  }, 4000);
}

// ============================
// OJITOS DE CONTRASEÑA
// ============================
function initPasswordToggles() {
  const toggles = document.querySelectorAll(".toggle-password");

  toggles.forEach((btn) => {
    const targetId = btn.dataset.target;
    if (!targetId) return;

    const input = document.getElementById(targetId);
    if (!input) return;

    const icon = btn.querySelector("i");

    // Actualiza la visibilidad del ojito según si hay texto o no
    function updateVisibility() {
      if (input.value.trim().length > 0) {
        btn.classList.remove("hidden-eye");
      } else {
        btn.classList.add("hidden-eye");
        // Si se limpia el campo, vuelve a poner el input en modo password
        input.type = "password";
        if (icon) {
          icon.classList.remove("fa-eye-slash");
          icon.classList.add("fa-eye");
        }
      }
    }

    updateVisibility();
    input.addEventListener("input", updateVisibility);

    btn.addEventListener("click", () => {
      if (btn.classList.contains("hidden-eye")) return; // seguridad extra

      const showing = input.type === "text";
      input.type = showing ? "password" : "text";

      if (icon) {
        if (showing) {
          icon.classList.remove("fa-eye-slash");
          icon.classList.add("fa-eye");
        } else {
          icon.classList.remove("fa-eye");
          icon.classList.add("fa-eye-slash");
        }
      }
    });
  });
}

function initModalDividers() {
  [
    "client-detail-modal",
    "user-modal",
    "client-modal",
    "change-password-modal",
    "cashbox-modal",
    "loan-modal",
    "loan-payment-modal",
  ].forEach((modalId) => {
    const modal = document.getElementById(modalId);
    const title = modal?.querySelector(".modal-box > h3");
    if (!title) return;

    const nextElement = title.nextElementSibling;
    if (nextElement && nextElement.classList.contains("modal-divider")) return;

    const divider = document.createElement("hr");
    divider.className = "modal-divider";
    title.insertAdjacentElement("afterend", divider);
  });
}


// ============================
// LOGIN
// ============================

const LOGIN_FX_ICON_CLASSES = [
  "fas fa-store",
  "fas fa-user-clock",
  "fas fa-donate",
  "fas fa-chart-pie",
  "fas fa-file-signature",
  "fas fa-hand-holding-usd",
  "fas fa-id-card",
  "far fa-money-bill-alt",
  "fas fa-people-carry",
  "fas fa-chart-line",
  "fas fa-shopping-cart",
  "fas fa-suitcase",
  "fas fa-user-tie",
  "fas fa-dollar-sign",
  "fas fa-balance-scale",
  "fas fa-book",
  "fas fa-coins",
  "fas fa-chart-bar",
  "fas fa-comments-dollar",
  "fas fa-clipboard-list",
];

function createLoginFxIconsMarkup(offset = 0) {
  return LOGIN_FX_ICON_CLASSES.map((_, index) => {
    const iconIndex = (index + offset) % LOGIN_FX_ICON_CLASSES.length;
    return `<i class="login-fx-icon ${LOGIN_FX_ICON_CLASSES[iconIndex]}" aria-hidden="true"></i>`;
  }).join("");
}

function renderLoginFxGrid(grid) {
  if (!grid) return;

  const rowCount = Math.max(12, Math.ceil(window.innerHeight / 54) + 6);
  const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
    const direction = rowIndex % 2 === 0 ? "left" : "right";
    const firstTrack = createLoginFxIconsMarkup(rowIndex % LOGIN_FX_ICON_CLASSES.length);

    return `
      <div class="login-fx-row" data-direction="${direction}">
        <div class="login-fx-track">${firstTrack}</div>
        <div class="login-fx-track">${firstTrack}</div>
      </div>
    `;
  }).join("");

  grid.innerHTML = rows;
}

function restartLoginFxAnimation(grid) {
  if (!grid) return;

  const tracks = grid.querySelectorAll(".login-fx-track");
  tracks.forEach((track) => {
    track.style.animation = "none";
  });

  void grid.offsetHeight;

  tracks.forEach((track) => {
    track.style.animation = "";
  });
}

function initLoginEffects() {
  const grid = document.getElementById("login-fx-grid");
  if (!grid) return;

  renderLoginFxGrid(grid);
  restartLoginFxAnimation(grid);

  let resizeFrame = null;
  let restartTimer = window.setInterval(() => {
    restartLoginFxAnimation(grid);
  }, 20000);

  window.addEventListener("resize", () => {
    if (resizeFrame) {
      window.cancelAnimationFrame(resizeFrame);
    }

    resizeFrame = window.requestAnimationFrame(() => {
      renderLoginFxGrid(grid);
      restartLoginFxAnimation(grid);
    });
  }, { passive: true });

  window.addEventListener("pagehide", () => {
    window.clearInterval(restartTimer);
    restartTimer = null;
  }, { once: true });
}

function initLoginPage() {
  const form = document.getElementById("login-form");
  if (!form) return;
  initLoginEffects();
  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");
  const errorLabel = document.getElementById("login-error");


    // Mostrar toast que venga desde otra pantalla (p.ej. cambio de contraseña)
  const pendingToastRaw = sessionStorage.getItem("gestor_am_login_toast");
  if (pendingToastRaw) {
    sessionStorage.removeItem("gestor_am_login_toast");
    try {
      const data = JSON.parse(pendingToastRaw);
      if (data && data.message) {
        showToast(data.message, data.type || "success");
      }
    } catch {
      // ignorar error de parseo
    }
  }


  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorLabel.textContent = "";

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      errorLabel.textContent = "Ingresa usuario y contraseña.";
      return;
    }

    try {
      const data = await apiPost("/api/login", { username, password });

      if (!data.ok) {
        errorLabel.textContent = data.message || "Error al iniciar sesión.";
        return;
      }

    setSession({
  token: data.token,
  userId: data.user.id,
  username: data.user.username,
  fullName: data.user.fullName || data.user.username,
  role: data.user.role || "user",
});


      window.location.href = "dashboard.html";
    } catch (err) {
      console.error("Login error:", err);
      errorLabel.textContent = "Error de conexión con el servidor.";
    }
  });
}

// ============================
// DASHBOARD GENERAL
// ============================

function initDashboard() {
  const dashboardRoot = document.getElementById("dashboard-page");
  if (!dashboardRoot) return;

  const session = getSession();
  if (!session) {
    window.location.href = "index.html";
    return;
  }
  CURRENT_SESSION = session;


  // ✅ Verificador de sesión (cada 5s)
// Si el admin cambió tu contraseña, el server responde 401 y te saca.
let sessionWatcherInterval = null;
let sessionWatcherVisibilityBound = false;

function startSessionWatcher() {
  if (!sessionWatcherInterval) {
    sessionWatcherInterval = setInterval(async () => {
      await apiGet("/api/me");
    }, 5000);
  }

  if (!sessionWatcherVisibilityBound) {
    document.addEventListener("visibilitychange", async () => {
      if (!document.hidden) {
        await apiGet("/api/me");
      }
    });
    sessionWatcherVisibilityBound = true;
  }
}
// ✅ Cierre por inactividad (1 hora)
const IDLE_LIMIT_MS = 60 * 60 * 1000; // 1 hora
let idleTimer = null;

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);

  idleTimer = setTimeout(() => {
    doLogout("Se ha cerrado sesión por inactividad.");
  }, IDLE_LIMIT_MS);
}

// eventos típicos de actividad (mouse, teclado, touch)
["click", "mousemove", "keydown", "scroll", "touchstart"].forEach((evt) => {
  window.addEventListener(evt, resetIdleTimer, { passive: true });
});

resetIdleTimer();

startSessionWatcher();

  const isAdmin = session.role === "admin";

  // Avatar con iniciales
  // Avatar con iniciales
  const avatarInitialsEl = document.getElementById("user-avatar-initials");
  if (avatarInitialsEl) {
    avatarInitialsEl.textContent = getInitialsFromUsername(session.username);
  }

  const topbarWelcome = document.getElementById("topbar-welcome");
  const avatarBtn = document.getElementById("user-avatar-btn");
  const dropdown = document.getElementById("user-dropdown");
  const wrapper = document.querySelector(".user-menu-wrapper");
  const changePwdBtn = document.getElementById("btn-change-password");
  const logoutTopBtn = document.getElementById("btn-logout-top");

function getWelcomeName() {
  return String(session.username || "Usuario").trim() || "Usuario";
}

function updateTopbarWelcome() {
  if (!topbarWelcome) return;

  const isMobile = window.innerWidth <= 900;
  const displayName = getWelcomeName();

  topbarWelcome.textContent = isMobile
    ? `Bienvenido: ${displayName}`
    : `Bienvenido Usuario: ${displayName}`;
}

  updateTopbarWelcome();
  window.addEventListener("resize", updateTopbarWelcome);
  // --- Sidebar responsive ---
  const sidebar = document.querySelector(".sidebar");
  const sidebarToggleBtn = document.getElementById("sidebar-toggle");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  const changePwdSidebarBtn = document.getElementById("btn-change-password-sidebar");
  const logoutSidebarBtn = document.getElementById("btn-logout-sidebar");

async function doLogout(message = null) {
  try {
    // best effort: cerrar sesión en server
    await apiPost("/api/logout", {});
  } catch {}

  setSession(null);

  if (message) {
    saveLoginToast(message, "error");
  }

  window.location.href = "index.html";
}


  function openSidebar() {
    if (!sidebar || !sidebarOverlay) return;
    sidebar.classList.add("open");
    sidebarOverlay.classList.remove("hidden");
  }

  function closeSidebar() {
    if (!sidebar || !sidebarOverlay) return;
    sidebar.classList.remove("open");
    sidebarOverlay.classList.add("hidden");
  }

  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!sidebar) return;
      const isOpen = sidebar.classList.contains("open");
      if (isOpen) closeSidebar();
      else openSidebar();
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeSidebar);
  }


  if (avatarBtn && dropdown && wrapper) {
    avatarBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("hidden");
    });

    document.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target)) {
        dropdown.classList.add("hidden");
      }
    });
  }

  if (logoutTopBtn) {
    logoutTopBtn.addEventListener("click", () => {
      dropdown && dropdown.classList.add("hidden");
      doLogout();
    });
  }

  // Cerrar sesión desde el footer del sidebar (móvil)
  if (logoutSidebarBtn) {
    logoutSidebarBtn.addEventListener("click", () => {
      closeSidebar();
      doLogout();
    });
  }


  // Modal cambiar contraseña
  const pwdModal = document.getElementById("change-password-modal");
  const pwdForm = document.getElementById("change-password-form");
  const newPwInput = document.getElementById("new-password");
  const confirmPwInput = document.getElementById("confirm-password");
  const pwdError = document.getElementById("change-password-error");
  const cancelPwdBtn = document.getElementById("cancel-change-password");

  function openPwdModal() {
    if (!pwdModal) return;
    newPwInput.value = "";
    confirmPwInput.value = "";
    pwdError.textContent = "";
    pwdModal.classList.remove("hidden");
  }

  function closePwdModal() {
    if (!pwdModal) return;
    pwdModal.classList.add("hidden");
  }

  if (changePwdBtn && pwdModal) {
    changePwdBtn.addEventListener("click", () => {
      dropdown && dropdown.classList.add("hidden");
      openPwdModal();
    });
  }

  // Cambiar contraseña desde el footer del sidebar (móvil)
  if (changePwdSidebarBtn && pwdModal) {
    changePwdSidebarBtn.addEventListener("click", () => {
      closeSidebar();
      openPwdModal();
    });
  }


  if (cancelPwdBtn) {
    cancelPwdBtn.addEventListener("click", () => {
      closePwdModal();
    });
  }

  if (pwdForm) {
    pwdForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      pwdError.textContent = "";

      const pw1 = newPwInput.value;
      const pw2 = confirmPwInput.value;

            if (!pw1 || !pw2) {
        pwdError.textContent = "Completa ambos campos.";
        return;
      }
      if (/\s/.test(pw1) || /\s/.test(pw2)) {
        pwdError.textContent =
          "No se puede colocar espacios en las contraseñas.";
        return;
      }
      if (pw1.length > 25) {
        pwdError.textContent =
          "La contraseña debe tener máximo 25 caracteres.";
        return;
      }
      if (pw1 !== pw2) {
        pwdError.textContent = "Las contraseñas no coinciden.";
        return;
      }


      try {
                const resp = await apiPost("/api/change-password", {
          userId: CURRENT_SESSION.userId,
          newPassword: pw1,
        });

        if (!resp.ok) {
          pwdError.textContent =
            resp.message || "No se pudo cambiar la contraseña.";
          return;
        }

        // Guardar mensaje para mostrarlo en el login
        sessionStorage.setItem(
          "gestor_am_login_toast",
          JSON.stringify({
            message:
              "Contraseña cambiada correctamente. Inicia sesión nuevamente.",
            type: "success",
          })
        );

        closePwdModal();
        setSession(null);
        window.location.href = "index.html";


      } catch (err) {
        console.error("Error change-password:", err);
        pwdError.textContent = "Error de conexión con el servidor.";
      }
    });
  }

  // Navegación en sidebar
  const menuButtons = document.querySelectorAll(".menu-item");
  menuButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      closeSidebar(); // en móvil, cierra el drawer al navegar

      const section = btn.dataset.section;

      if (!section) return;

      menuButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document
        .querySelectorAll(".content-section")
        .forEach((sec) => sec.classList.remove("active"));

      const target = document.getElementById(`section-${section}`);
      if (target) target.classList.add("active");
    });
  });

  // Ocultar sección usuarios si no es admin
  if (!isAdmin) {
    const usersMenuItem = document.querySelector(
      '.menu-item[data-section="users"]'
    );
    const usersSection = document.getElementById("section-users");
    if (usersMenuItem) usersMenuItem.classList.add("hidden");
    if (usersSection) usersSection.classList.add("hidden");

    const clientsSection = document.getElementById("section-clients");
    if (clientsSection) clientsSection.classList.add("active");
    const clientsMenuItem = document.querySelector(
      '.menu-item[data-section="clients"]'
    );
    if (clientsMenuItem) clientsMenuItem.classList.add("active");
  }

  // Inicializar secciones
  if (isAdmin) initUsersSection();
  initClientsSection();
    initLoansSection();
  initCashboxSection();
  initMovementsSection();
}
// ============================
// SECCIÓN USUARIOS (ADMIN)
// ============================

function initUsersSection() {
  const form = document.getElementById("user-form");
  const modal = document.getElementById("user-modal");
  const modalTitle = document.getElementById("user-modal-title");
  const openBtn = document.getElementById("btn-add-user");

  if (!form || !modal) return;

  const idInput = document.getElementById("user-id");
  const usernameInput = document.getElementById("user-username");
  const fullNameInput = document.getElementById("user-fullname");
  const passwordInput = document.getElementById("user-password");
  const passwordConfirmInput = document.getElementById("user-password-confirm");
  const roleSelect = document.getElementById("user-role");
  const errorLabel = document.getElementById("user-form-error");
  const cancelBtn = document.getElementById("user-cancel-edit");
  const tableBody = document.querySelector("#users-table tbody");
    const currentUserId = CURRENT_SESSION ? CURRENT_SESSION.userId : null;

  // Modal de confirmar habilitar / inhabilitar
  const toggleModal = document.getElementById("user-toggle-modal");
  const toggleTitle = document.getElementById("user-toggle-title");
  const toggleMessage = document.getElementById("user-toggle-message");
  const toggleCancelBtn = document.getElementById("user-toggle-cancel");
  const toggleConfirmBtn = document.getElementById("user-toggle-confirm");
  let userPendingToggle = null;

  if (!tableBody) return;

  function clearForm() {
    idInput.value = "";
    fullNameInput.value = "";
usernameInput.value = "";
    passwordInput.value = "";
    if (passwordConfirmInput) passwordConfirmInput.value = "";
    if (roleSelect) roleSelect.value = "user";
    if (errorLabel) errorLabel.textContent = "";
  }

  function openModalForCreate() {
    clearForm();
    if (modalTitle) modalTitle.textContent = "Agregar usuario";
    modal.classList.remove("hidden");
  }

  function openModalForEdit(user) {
    idInput.value = user.id;
    fullNameInput.value = user.full_name || user.fullName || user.username || "";
usernameInput.value = user.username;
    if (roleSelect) roleSelect.value = user.role || "user";
    passwordInput.value = "";
    if (passwordConfirmInput) passwordConfirmInput.value = "";
    if (errorLabel) errorLabel.textContent = "";
    if (modalTitle) modalTitle.textContent = "Editar usuario";
    modal.classList.remove("hidden");
  }

  function closeModal() {
    modal.classList.add("hidden");
  }

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      openModalForCreate();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      closeModal();
      clearForm();
    });
  }

  const backdrop = modal.querySelector(".modal-backdrop");
  if (backdrop) {
    backdrop.addEventListener("click", () => {
      closeModal();
    });
  }

  function openToggleModal(user) {
    if (!toggleModal) {
      // por si acaso el modal no existe, se hace el cambio directo
      handleToggleUser(user);
      return;
    }

    userPendingToggle = user;
    const isActive = !!user.active;

    if (toggleTitle) {
      toggleTitle.textContent = isActive
        ? "Inhabilitar usuario"
        : "Habilitar usuario";
    }

    if (toggleMessage) {
      toggleMessage.textContent = isActive
        ? `¿Deseas inhabilitar al usuario "${user.username}"?`
        : `¿Deseas habilitar al usuario "${user.username}"?`;
    }

    toggleModal.classList.remove("hidden");
  }

  function closeToggleModal() {
    if (!toggleModal) return;
    toggleModal.classList.add("hidden");
    userPendingToggle = null;
  }

  async function handleToggleUser(user) {
    try {
      const resp = await apiPost("/api/users/toggle", {
  id: user.id,
  currentUserId,
});

      if (!resp.ok) {
        showToast(resp.message || "No se pudo actualizar el estado.", "error");
        return;
      }
      showToast("Estado de usuario actualizado.", "success");
      await renderUsers();
    } catch (err) {
      console.error("Error toggle user:", err);
      showToast("Error de conexión con el servidor.", "error");
    }
  }

  if (toggleCancelBtn) {
    toggleCancelBtn.addEventListener("click", () => {
      closeToggleModal();
    });
  }

  if (toggleModal) {
    const toggleBackdrop = toggleModal.querySelector(".modal-backdrop");
    if (toggleBackdrop) {
      toggleBackdrop.addEventListener("click", () => {
        closeToggleModal();
      });
    }
  }

  if (toggleConfirmBtn) {
    toggleConfirmBtn.addEventListener("click", async () => {
      if (!userPendingToggle) return;
      await handleToggleUser(userPendingToggle);
      closeToggleModal();
    });
  }

  async function renderUsers() {
    try {
      const data = await apiGet("/api/users");
      if (!data.ok) {
        tableBody.innerHTML =
          "<tr><td colspan='4'>Error cargando usuarios</td></tr>";
        return;
      }

      tableBody.innerHTML = "";

      data.users.forEach((user) => {
        const tr = document.createElement("tr");

       const tdUser = document.createElement("td");
tdUser.textContent = user.username;

const tdType = document.createElement("td");
const typeSpan = document.createElement("span");
const isAdminRole = String(user.role || "").toLowerCase() === "admin";

typeSpan.className =
  "user-type-pill " + (isAdminRole ? "type-admin" : "type-user");
typeSpan.textContent = isAdminRole ? "Administrador" : "Usuario";
tdType.appendChild(typeSpan);

const tdDate = document.createElement("td");
tdDate.textContent = formatDateTime(user.created_at);


        const tdStatus = document.createElement("td");
        const statusSpan = document.createElement("span");
        const isActive = !!user.active;
        statusSpan.className =
          "user-status-pill " +
          (isActive ? "status-active" : "status-inactive");
        statusSpan.textContent = isActive ? "Activo" : "Inhabilitado";
        tdStatus.appendChild(statusSpan);

        const tdActions = document.createElement("td");
        const actionsWrap = document.createElement("div");
        actionsWrap.className = "table-actions";

        const editBtn = document.createElement("button");
        editBtn.className = "btn secondary btn-action btn-action-secondary btn-icon-rect";
        editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
        editBtn.title = "Editar usuario";
        editBtn.addEventListener("click", () => {
          openModalForEdit(user);
        });

        const toggleBtn = document.createElement("button");
toggleBtn.className = "btn btn-action btn-status-toggle";

const isSelf = currentUserId && Number(user.id) === Number(currentUserId);

if (isActive) {
  toggleBtn.classList.add("status-active-btn");
  toggleBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  toggleBtn.title = isSelf
    ? "No puedes inhabilitar tu propio usuario"
    : "Inhabilitar usuario";
} else {
  toggleBtn.classList.add("status-inactive-btn");
  toggleBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
  toggleBtn.title = isSelf
    ? "No puedes inhabilitar tu propio usuario"
    : "Habilitar usuario";
}

toggleBtn.addEventListener("click", () => {
  if (isSelf) {
    showToast("No puedes inhabilitar tu propio usuario.", "error");
    return;
  }
  openToggleModal(user);
});


        actionsWrap.appendChild(editBtn);
        actionsWrap.appendChild(toggleBtn);
        tdActions.appendChild(actionsWrap);

        tr.appendChild(tdUser);
tr.appendChild(tdType);
tr.appendChild(tdDate);
tr.appendChild(tdStatus);
tr.appendChild(tdActions);

        tableBody.appendChild(tr);
      });
    } catch (err) {
      console.error("Error renderUsers:", err);
      tableBody.innerHTML =
        "<tr><td colspan='4'>Error de conexión</td></tr>";
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errorLabel) errorLabel.textContent = "";

    const fullName = fullNameInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const passwordConfirm = passwordConfirmInput
      ? passwordConfirmInput.value.trim()
      : "";
    const role = roleSelect ? roleSelect.value : "user";
    const editingId = idInput.value ? Number(idInput.value) : null;

    if (!fullName) {
  errorLabel.textContent = "Ingresa el nombre completo.";
  return;
}
    if (!username) {
      errorLabel.textContent = "Ingresa un nombre de usuario.";
      return;
    }
    if (username.length < 5) {
  errorLabel.textContent =
    "El usuario debe tener al menos 5 caracteres.";
  return;
}
    if (username.length > 20) {
      errorLabel.textContent =
        "El usuario debe tener máximo 20 caracteres.";
      return;
    }
    if (/\s/.test(username)) {
      errorLabel.textContent =
        "El usuario no puede contener espacios.";
      return;
    }

    

    // Para usuario nuevo, la contraseña es obligatoria
    if (!editingId && !password) {
      errorLabel.textContent = "Ingresa una contraseña.";
      return;
    }

    if (password) {
      if (password.length > 25) {
        errorLabel.textContent =
          "La contraseña debe tener máximo 25 caracteres.";
        return;
      }

      if (password.length < 8) {
    errorLabel.textContent =
      "La contraseña debe tener al menos 8 caracteres.";
    return;
  }
      if (/\s/.test(password)) {
        errorLabel.textContent =
          "La contraseña no puede contener espacios.";
        return;
      }
      if (password !== passwordConfirm) {
        errorLabel.textContent = "Las contraseñas no coinciden.";
        return;
      }
    }

    try {
      const resp = await apiPost("/api/users/save", {
  id: editingId,
  fullName,
  username,
  password: password || undefined,
  role,
});

      if (!resp.ok) {
        errorLabel.textContent = resp.message || "No se pudo guardar.";
        showToast(resp.message || "No se pudo guardar.", "error");
        return;
      }

      let msg;
      if (editingId) {
        if (password) {
          msg =
            "Usuario actualizado. La contraseña ha sido cambiada; el usuario deberá iniciar sesión nuevamente.";
        } else {
          msg = "Usuario actualizado correctamente.";
        }
      } else {
        msg = "Usuario creado correctamente.";
      }
      showToast(msg, "success");

      closeModal();
      clearForm();
      renderUsers();
    } catch (err) {
      console.error("Error guardando usuario:", err);
      errorLabel.textContent = "Error de conexión con el servidor.";
      showToast("Error de conexión con el servidor.", "error");
    }
  });

  renderUsers();
}



// ============================
// SECCIÓN CLIENTES
// ============================

function initClientsSection() {
  const section = document.getElementById("section-clients");
  if (!section) return;

  const tableBody = document.querySelector("#clients-table tbody");
  const searchInput = document.getElementById("client-search");
  const searchClear = document.getElementById("client-search-clear");

  const openClientModalBtn = document.getElementById("btn-add-client");
  const clientModal = document.getElementById("client-modal");
  const clientForm = document.getElementById("client-form");
  const clientFormError = document.getElementById("client-form-error");
const cedulaInput = document.getElementById("client-id");
const firstNameInput = document.getElementById("client-firstname");
const lastNameInput = document.getElementById("client-lastname");

// ✅ Cédula: permitir cualquier cosa, pero NO espacios
if (cedulaInput) {
  cedulaInput.addEventListener("input", () => {
    const original = cedulaInput.value;
    const cleaned = original.replace(/\s+/g, ""); // quita espacios
    if (original !== cleaned) {
      cedulaInput.value = cleaned;
      // Sin toast. Si quieres, podrías poner un mensaje abajo, pero tú pediste nada extra.
    }
  });
}

  const clientDetailModal = document.getElementById("client-detail-modal");
  const clientDetailContent = document.getElementById("client-detail-content");
  const clientDetailClose = document.getElementById("client-detail-close");

  // NUEVO: modal de eliminación de cliente
  const deleteModal = document.getElementById("client-delete-modal");
  const deleteMessage = document.getElementById("client-delete-message");
  const deleteConfirmBtn = document.getElementById("client-delete-confirm");
  const deleteCancelBtn = document.getElementById("client-delete-cancel");
  let clientPendingDeletion = null;


  if (!tableBody || !clientForm) return;

  let allClients = [];
  let allLoans = [];

  // -------- helpers de modal --------
  function openClientModal() {
    clientFormError.textContent = "";
    clientForm.reset();
    clientModal.classList.remove("hidden");
  }

  function closeClientModal() {
    clientModal.classList.add("hidden");
  }

     function openClientDetailModal(html) {
    clientDetailContent.innerHTML = html;
    clientDetailModal.classList.remove("hidden");
  }

    function openDeleteModal(client) {
    if (!deleteModal) return;
    clientPendingDeletion = client;
    if (deleteMessage) {
      deleteMessage.textContent = `¿Estás seguro de eliminar al cliente ${client.fullName} (${client.id})? Esta acción no se puede deshacer.`;
    }
    deleteModal.classList.remove("hidden");
  }

  function closeDeleteModal() {
    if (!deleteModal) return;
    deleteModal.classList.add("hidden");
    clientPendingDeletion = null;
  }

  function handleDeleteClient(client, clientLoans) {
    const totalLoans = clientLoans.length;
    if (totalLoans > 0) {
      showToast(
        "No se puede eliminar el cliente porque tiene préstamos registrados.",
        "error"
      );
      return;
    }
    openDeleteModal(client);
  }


   function closeClientDetailModal() {
    clientDetailModal.classList.add("hidden");
  }

  // -------- validaciones --------
function validateCedula(value) {
  const v = String(value || "");

  // ✅ único requisito: NO espacios
  if (/\s/.test(v)) {
    return "La cédula no puede contener espacios.";
  }

  // (opcional) si quieres obligar a que no esté vacío, descomenta:
  // if (!v.trim()) return "Ingresa la cédula.";

  return "";
}

  function validateName(value, label) {
    const trimmed = value.trim();
    if (!trimmed) {
      return `Ingresa ${label.toLowerCase()}.`;
    }
    const regex = /^[A-Za-zÁÉÍÓÚáéíóúÑñ]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñ]+)*$/;
    if (!regex.test(trimmed)) {
      return `El campo ${label} solo puede contener letras y espacios (sin números ni caracteres especiales).`;
    }
    return "";
  }

  // -------- carga de datos del servidor --------
  async function loadClientsAndLoans() {
    try {
      const [clientsRes, loansRes] = await Promise.all([
        apiGet(`/api/clients`),
apiGet(`/api/loans`),
      ]);

      if (!clientsRes.ok) {
        tableBody.innerHTML =
          "<tr><td colspan='4'>Error cargando clientes</td></tr>";
        return;
      }

      allClients = clientsRes.clients || [];
      allLoans = loansRes.ok ? loansRes.loans || [] : [];

      renderClients();
    } catch (err) {
      console.error("Error loadClientsAndLoans:", err);
      tableBody.innerHTML =
        "<tr><td colspan='4'>Error de conexión</td></tr>";
    }
  }

    // Hacemos disponible la recarga de clientes/préstamos para otras secciones
  window.__refreshClientsAndLoans = async function () {
    try {
      await loadClientsAndLoans();
    } catch (e) {
      console.error("Error refrescando clientes desde préstamos:", e);
    }
  };


  // -------- render tabla clientes --------
   function renderClients() {
    if (!tableBody) return;

    const term = (searchInput.value || "").trim().toLowerCase();
    tableBody.innerHTML = "";

    allClients
      .filter((c) => {
        if (!term) return true;
        return (
          c.id.toLowerCase().includes(term) ||
          (c.fullName || "").toLowerCase().includes(term)
        );
      })
      .forEach((client) => {
        const clientLoans = allLoans.filter((l) => l.clientId === client.id);
        const closedLoans = clientLoans.filter(
          (l) => l.status === "closed"
        ).length;
        const openLoans = clientLoans.filter(
          (l) => l.status === "open"
        ).length;

        const tr = document.createElement("tr");

        const tdId = document.createElement("td");
        tdId.textContent = client.id;

        const tdName = document.createElement("td");
        tdName.textContent = client.fullName;

        const tdDate = document.createElement("td");
        tdDate.textContent = formatDateTime(client.createdAt);

        const tdClosed = document.createElement("td");
        tdClosed.textContent = String(closedLoans);

        const tdOpen = document.createElement("td");
        tdOpen.textContent = String(openLoans);

        const tdActions = document.createElement("td");

       // Botón VER
        const actionsWrap = document.createElement("div");
        actionsWrap.className = "table-actions";
const viewBtn = document.createElement("button");
viewBtn.className = "btn secondary btn-action btn-action-secondary";
viewBtn.innerHTML = `<i class="fa-solid fa-eye"></i>`;
viewBtn.title = "Ver préstamos del cliente";

       viewBtn.addEventListener("click", async () => {
  await openClientDetail(client, clientLoans);
});

        actionsWrap.appendChild(viewBtn);

        // Botón ELIMINAR
        const deleteBtn = document.createElement("button");
deleteBtn.className = "btn danger btn-action btn-trash";
deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
deleteBtn.title = "Eliminar cliente";

        deleteBtn.addEventListener("click", () =>
          handleDeleteClient(client, clientLoans)
        );
        actionsWrap.appendChild(deleteBtn);
        tdActions.appendChild(actionsWrap);

        tr.appendChild(tdId);
        tr.appendChild(tdName);
        tr.appendChild(tdDate);
        tr.appendChild(tdClosed);
        tr.appendChild(tdOpen);
        tr.appendChild(tdActions);

        tableBody.appendChild(tr);
      });
  }

async function openClientDetail(client, loans) {

  if (!client) return;

  // Solo préstamos CERRADOS de este cliente
  const closedLoans = (loans || []).filter(
    (l) => l.clientId === client.id && l.status === "closed"
  );

  let html = "";

  // Si NO tiene préstamos cerrados
  if (!closedLoans.length) {
    html += `
      <p class="client-detail-empty">
        El cliente no tiene aún préstamos finalizados.
      </p>
    `;
    openClientDetailModal(html);
    return;
  }

  // Contenedor general + cabecera tipo tabla
      html += `<div class="client-closed-loans">`;

  for (const loan of closedLoans) {
    let payments = [];
    try {
      const res = await apiGet(`/api/loans/${loan.id}/payments`);
      if (res.ok) payments = res.payments || [];
    } catch (err) {
      console.error("Error cargando abonos del préstamo", loan.id, err);
    }

    const paymentsRows = payments.length
      ? payments
          .map(
            (p, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>$${Number(p.amount).toFixed(2)}</td>
            <td>${formatDateTime(p.created_at)}</td>
          </tr>`
          )
          .join("")
      : `<tr><td colspan="3">Sin abonos registrados.</td></tr>`;

      html += `
      <div class="client-closed-loan">
        <div class="client-closed-loans-header">
          <span>MONTO</span>
          <span>% INT.</span>
          <span>TOTAL</span>
          <span>INICIO</span>
          <span>FIN</span>
          <span></span>
        </div>

        <div class="client-closed-loan-row">
          <span>$${Number(loan.principal).toFixed(2)}</span>
          <span>${Number(loan.interestRate).toFixed(2)} %</span>
          <span>$${Number(loan.totalAmount).toFixed(2)}</span>
          <span>${formatDateTime(loan.startDate)}</span>
          <span>${formatDateTime(loan.endDate)}</span>
          <button
            type="button"
            class="client-closed-loan-toggle"
            data-loan-id="${loan.id}"
            title="Ver abonos"
          >
            <i class="fa-solid fa-angle-down"></i>
          </button>
        </div>

        <div class="client-closed-loan-payments hidden" data-loan-id="${loan.id}">
          <table class="table mini-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Monto del abono</th>
                <th>Fecha de abono</th>
              </tr>
            </thead>
            <tbody>
              ${paymentsRows}
            </tbody>
          </table>
        </div>
      </div>

      <hr class="client-closed-loan-divider" />
    `;
  }

  html += `</div>`;

  // Pintamos el contenido en el modal
  openClientDetailModal(html);

  // Activamos las flechitas (abrir/cerrar abonos)
  const container = document.getElementById("client-detail-content");
  const toggles = container.querySelectorAll(".client-closed-loan-toggle");

  toggles.forEach((btn) => {
    btn.addEventListener("click", () => {
      const loanId = btn.getAttribute("data-loan-id");
      const panel = container.querySelector(
        `.client-closed-loan-payments[data-loan-id="${loanId}"]`
      );
      if (!panel) return;

      panel.classList.toggle("hidden");
      btn.classList.toggle("open");
    });
  });
}

  // -------- eventos --------
  if (openClientModalBtn) {
    openClientModalBtn.addEventListener("click", openClientModal);
  }

  const clientCancelBtn = document.getElementById("client-cancel");
  if (clientCancelBtn) {
    clientCancelBtn.addEventListener("click", closeClientModal);
  }

  if (clientModal) {
    const backdrop = clientModal.querySelector(".modal-backdrop");
    if (backdrop) {
      backdrop.addEventListener("click", closeClientModal);
    }
  }

  if (clientDetailClose) {
    clientDetailClose.addEventListener("click", closeClientDetailModal);
  }
  if (clientDetailModal) {
    const backdrop = clientDetailModal.querySelector(".modal-backdrop");
    if (backdrop) {
      backdrop.addEventListener("click", closeClientDetailModal);
    }
  }

    // --- eventos modal eliminar cliente ---
  if (deleteCancelBtn) {
    deleteCancelBtn.addEventListener("click", closeDeleteModal);
  }

  if (deleteModal) {
    const deleteBackdrop = deleteModal.querySelector(".modal-backdrop");
    if (deleteBackdrop) {
      deleteBackdrop.addEventListener("click", closeDeleteModal);
    }
  }

  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener("click", async () => {
      if (!clientPendingDeletion) return;
      try {
        const resp = await apiPost("/api/clients/delete", { cedula: clientPendingDeletion.id });

        if (!resp.ok) {
          showToast(
            resp.message || "No se pudo eliminar el cliente.",
            "error"
          );
          return;
        }

        showToast("Cliente eliminado correctamente.", "success");
        closeDeleteModal();
        await loadClientsAndLoans();
      } catch (err) {
        console.error("Error delete client:", err);
        showToast("Error de conexión con el servidor.", "error");
      }
    });
  }


 clientForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clientFormError.textContent = "";

    const cedula = cedulaInput.value.trim();
    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();

    let error =
      validateCedula(cedula) ||
      validateName(firstName, "Nombres") ||
      validateName(lastName, "Apellidos");

    if (error) {
      clientFormError.textContent = error;
      return;
    }

    const fullName = `${lastName} ${firstName}`.replace(/\s+/g, " ").trim();


   try {
  const data = await apiPost("/api/clients", { cedula, fullName });

  if (!data.ok) {
    const msg =
      data.message ||
      `El cliente con cédula "${cedula}" ya existe. Intenta con otra cédula.`;
    clientFormError.textContent = msg;
    return;
  }

  showToast("Cliente creado correctamente.", "success");
  closeClientModal();
  loadClientsAndLoans();
} catch (err) {
  console.error(err);
  clientFormError.textContent =
    "No se pudo guardar el cliente. Inténtalo de nuevo.";
  showToast("No se pudo guardar el cliente.", "error");
}

  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderClients();
    });
  }

  if (searchClear) {
    searchClear.addEventListener("click", () => {
      searchInput.value = "";
      renderClients();
      searchInput.focus();
    });
  }

  // Carga inicial
  loadClientsAndLoans();
}



// ============================
// SECCIÓN PRÉSTAMOS
// ============================

function initLoansSection() {
  const section = document.getElementById("section-loans");
  if (!section) return;

  // Modal + controles
  const openBtn = document.getElementById("btn-add-loan");
  const modal = document.getElementById("loan-modal");
  const form = document.getElementById("loan-form");
  const clientSelect = document.getElementById("loan-client");
  const amountInput = document.getElementById("loan-amount");
  const endDateInput = document.getElementById("loan-end-date");
  const interestInput = document.getElementById("loan-interest");
  const intMinus = document.getElementById("loan-int-minus");
  const intPlus = document.getElementById("loan-int-plus");
  const dailyInput = document.getElementById("loan-daily");
  const totalInput = document.getElementById("loan-total");
  const errorLabel = document.getElementById("loan-form-error");
  const cancelBtn = document.getElementById("loan-cancel");

  const calendarEl = document.getElementById("loan-calendar");
  const calendarAnchorGroup = endDateInput?.closest(".loan-date-group") || null;
  let loanCalendar = null;


  const tableBody = document.querySelector("#loans-table tbody");

    // ------ Modal eliminar préstamo ------
  const loanDeleteModal   = document.getElementById("loan-delete-modal");
  const loanDeleteMessage = document.getElementById("loan-delete-message");
  const loanDeleteCancel  = document.getElementById("loan-delete-cancel");
  const loanDeleteConfirm = document.getElementById("loan-delete-confirm");

  let loanPendingDeletion = null;

  function openLoanDeleteModal(loan, clientName) {
    if (!loanDeleteModal) return;

    loanPendingDeletion = loan;

    if (loanDeleteMessage) {
      const monto = Number(loan.principal || loan.totalAmount || 0).toFixed(2);
      loanDeleteMessage.textContent =
        `¿Estás seguro de eliminar el préstamo de "${clientName}" por $${monto}? ` +
        `Esta acción no se puede deshacer.`;
    }

    loanDeleteModal.classList.remove("hidden");
  }

  function closeLoanDeleteModal() {
    if (!loanDeleteModal) return;
    loanPendingDeletion = null;
    loanDeleteModal.classList.add("hidden");
  }

  if (loanDeleteCancel) {
    loanDeleteCancel.addEventListener("click", closeLoanDeleteModal);
  }

  // cerrar clicando en el fondo oscuro
  if (loanDeleteModal) {
    const backdrop = loanDeleteModal.querySelector(".modal-backdrop");
    if (backdrop) {
      backdrop.addEventListener("click", closeLoanDeleteModal);
    }
  }

  if (loanDeleteConfirm) {
    loanDeleteConfirm.addEventListener("click", async () => {
      if (!loanPendingDeletion) return;

      const id = loanPendingDeletion.id;

      try {
        const resp = await apiPost("/api/loans/delete", {
  loanId: id,
});

        if (!resp.ok) {
          showToast(resp.message || "No se pudo eliminar.", "error");
          return;
        }

        showToast("Préstamo eliminado.", "success");
closeLoanDeleteModal();
await renderLoans();

if (window.__refreshGeneralMovements) {
  await window.__refreshGeneralMovements();
}
      } catch (e) {
        console.error(e);
        showToast("Error de conexión con el servidor.", "error");
      }
    });
  }


 if (interestInput) {
  interestInput.value = `${DEFAULT_INTEREST_RATE.toFixed(2)} %`;
}

if (!openBtn || !modal || !form || !tableBody) return;

  // ===== Helpers de modal

function setupLoanCalendar(minDate) {
    if (!calendarEl || typeof FullCalendar === "undefined") {
      console.warn("FullCalendar no está disponible");
      return;
    }

    const minStr = formatDateYYYYMMDD(minDate);

    if (!loanCalendar) {
      loanCalendar = new FullCalendar.Calendar(calendarEl, {
  height: "auto",          // sin scroll vertical
  contentHeight: "auto",   // se adapta al contenido
  initialView: "dayGridMonth",
  locale: "es",
  firstDay: 1,
  headerToolbar: {
    left: "prev,next",     // quitamos el botón "today"
    center: "title",
    right: ""
  },
  selectable: true,
  validRange: { start: minStr },
  dateClick(info) {
    consumeUiEvent(info.jsEvent);
    const selectedStr = formatDateYYYYMMDD(info.date);

    if (selectedStr < minStr) return;

    endDateInput.value = selectedStr; // yyyy-mm-dd
    updateDailyEstimate();
    dismissCalendarAfterSelection(hideCalendar);
  }
});


      loanCalendar.render();
    } else {
      loanCalendar.setOption("validRange", { start: minStr });
      loanCalendar.gotoDate(minDate);
    }
  }

  function showCalendar() {
    if (!calendarEl) return;
    showCalendarPopover(calendarEl, endDateInput, loanCalendar);
  }

  function hideCalendar() {
    hideCalendarPopover(calendarEl);
  }

  function openModal() {
    errorLabel.textContent = "";
    form.reset();

    // interés por defecto (config global)
    interestInput.value = `${DEFAULT_INTEREST_RATE.toFixed(2)} %`;

    // Mínimo: desde mañana (como ya lo teníamos)
    const today = new Date();
    const tomorrow = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1
    );

    // limpiar campo fecha y preparar calendario
    endDateInput.value = "";
    endDateInput.placeholder = "aaaa-mm-dd";

    setupLoanCalendar(tomorrow);
    hideCalendar(); // solo se muestra cuando el usuario hace clic en el campo

    // cargar clientes
    loadClientsIntoSelect();

    // precalcular pago diario si ya hay monto y fecha
    updateDailyEstimate();

    modal.classList.remove("hidden");
  }

  function closeModal() {
    modal.classList.add("hidden");
    hideCalendar();
  }

  if (openBtn) openBtn.addEventListener("click", openModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  // Cerrar el modal al hacer clic sobre el fondo oscuro
  const loanBackdrop = modal.querySelector(".modal-backdrop");
  if (loanBackdrop) {
    loanBackdrop.addEventListener("click", closeModal);
  }

  // ===== Cargar clientes
  async function loadClientsIntoSelect() {
    clientSelect.innerHTML = "";
    try {
      const res = await apiGet("/api/clients");
      const clients = res.ok ? res.clients : [];
      // opción placeholder
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "Selecciona un cliente…";
      clientSelect.appendChild(opt0);
      // opciones
      clients.forEach(c => {
        const op = document.createElement("option");
        op.value = c.id;
        op.textContent = `${c.id} — ${c.fullName}`;
        clientSelect.appendChild(op);
      });
    } catch (e) {
      console.error(e);
      showToast("No se pudieron cargar los clientes.", "error");
    }
  }

  // ===== Interest stepper (±5%)
  function parseInterest() {
    return Number(interestInput.value.replace("%", "").trim()) || DEFAULT_INTEREST_RATE;
  }
  function setInterest(v) {
    const clamped = Math.max(0, v);
    interestInput.value = `${clamped.toFixed(2)} %`;
    updateDailyEstimate();
  }
 if (intMinus) {
  intMinus.addEventListener("click", () => setInterest(parseInterest() - 5));
}
if (intPlus) {
  intPlus.addEventListener("click", () => setInterest(parseInterest() + 5));
}

  // ===== Cálculos
 function safeParseMoney(str) {
  let s = String(str).trim();
  if (!s) return 0;

  // quitamos espacios por si acaso
  s = s.replace(/\s+/g, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  // Si tiene punto y coma, asumimos coma como decimal: 1.500,50 -> 1500.50
  if (hasComma && hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    // Solo coma: 150,5 -> 150.5
    s = s.replace(",", ".");
  }
  // Si solo tiene punto o solo números, lo dejamos así

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}


 function updateDailyEstimate() {
  const principal = safeParseMoney(amountInput.value);
  const interestRate = parseInterest(); // %

  const todayDateOnly = getLocalDateOnly();  // <-- usamos fecha local
  const end = endDateInput.value;           // yyyy-mm-dd
  const total = principal
    ? Number((principal * (1 + interestRate / 100)).toFixed(2))
    : 0;

  if (totalInput) {
    totalInput.value = total ? `$${total.toFixed(2)}` : "";
  }

  if (!principal || !end) {
    dailyInput.value = "";
    return;
  }

  const numDays = diffDays(todayDateOnly, end); // usa días completos
  const daily = Number((total / numDays).toFixed(2));

dailyInput.value = daily ? `$${daily.toFixed(2)}` : "";

}


 amountInput.addEventListener("input", () => {
  const original = amountInput.value;
  // Permitimos solo dígitos, punto y coma
  const cleaned = original.replace(/[^0-9.,]/g, "");

  if (original !== cleaned) {
    amountInput.value = cleaned;
    errorLabel.textContent =
      "El monto solo puede contener números, puntos (.) y comas (,).";
  } else {
    // si ya está limpio, borramos el mensaje de error de este campo
    if (errorLabel.textContent.startsWith("El monto solo puede")) {
      errorLabel.textContent = "";
    }
  }

  updateDailyEstimate();
});

  endDateInput.addEventListener("change", updateDailyEstimate);

    // Mostrar el calendario al enfocar/hacer clic en la fecha
  if (endDateInput) {
    endDateInput.readOnly = true; // lo reforzamos por si acaso
    endDateInput.addEventListener("focus", showCalendar);
    endDateInput.addEventListener("click", showCalendar);
  }

    // Cerrar el calendario al hacer clic fuera de él
  document.addEventListener("click", (ev) => {
    if (!calendarEl || calendarEl.classList.contains("hidden")) return;

    const target = ev.target;

    const clickedInsideCalendar = calendarEl.contains(target);
    const clickedOnInput =
      endDateInput && (endDateInput === target || endDateInput.contains(target));
    const clickedOnAnchorGroup =
      calendarAnchorGroup &&
      target instanceof Node &&
      calendarAnchorGroup.contains(target);

    // Si el clic NO fue ni en el calendario ni en el input de fecha, lo ocultamos
    if (!clickedInsideCalendar && !clickedOnInput && !clickedOnAnchorGroup) {
      hideCalendar();
    }
  });


   let currentLoans = [];
  let currentClientsById = new Map();

  function canDeleteLoanLive(loan) {
  return isWithinTimeWindow(loan.startDate);
}

function refreshLoanDeleteButtonsLive() {
  if (!currentLoans.length) return;

  tableBody.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
    const loanId = Number(btn.dataset.id);
    const loan = currentLoans.find((item) => Number(item.id) === loanId);

    if (!loan || !canDeleteLoanLive(loan)) {
      btn.remove();
    }
  });
}

  // ===== Render tabla
  async function renderLoans() {
    try {

      // Pedimos préstamos y clientes al backend
      const [loansRes, clientsRes] = await Promise.all([
        apiGet("/api/loans"),
        apiGet("/api/clients"),
      ]);

      // Listas seguras
      const loans = loansRes.ok && Array.isArray(loansRes.loans)
        ? loansRes.loans
        : [];
      const clients = clientsRes.ok && Array.isArray(clientsRes.clients)
        ? clientsRes.clients
        : [];

      const byId = new Map(clients.map((c) => [c.id, c]));

      // Guardamos referencias actuales para el listener de clicks
      currentLoans = loans;
      currentClientsById = byId;

      // Limpiamos la tabla
      tableBody.innerHTML = "";

      // Solo préstamos abiertos
      const openLoans = loans.filter((loan) => loan.status === "open");

      openLoans.forEach((loan) => {
        const nowDate  = new Date();
        const endDate  = new Date(loan.endDate);
        const isOverdue =
          !isNaN(endDate.getTime()) &&
          endDate < nowDate &&
          loan.status === "open";

        const tr = document.createElement("tr");

// ✅ guardamos la fecha fin real en la fila para recalcular “en vivo”
tr.dataset.endIso = loan.endDate;

// Si la fecha FIN ya pasó y sigue "open", pintamos la fila
if (isOverdue) {
  tr.classList.add("tr-loan-overdue");
}

        const client = byId.get(loan.clientId);

        const canDelete = isWithinTimeWindow(loan.startDate);

        tr.innerHTML = `
          <td>${loan.clientId}</td>
          <td>${client ? client.fullName : "-"}</td>
          <td>$${Number(loan.principal).toFixed(2)}</td>
          <td>${Number(loan.interestRate).toFixed(2)} %</td>
          <td>$${Number(loan.totalAmount).toFixed(2)}</td>
          <td>${formatDateTime(loan.startDate)}</td>
          <td>${formatDateTime(loan.endDate)}</td>
          <td>$${Number(isOverdue ? loan.remainingAmount : loan.dailyPayment).toFixed(2)}</td>
          <td id="loan-remaining-${loan.id}">
            $${Number(loan.remainingAmount).toFixed(2)}
          </td>
          <td>
            <div class="table-actions">
            <button class="btn btn-action btn-pay-action"
                    data-action="pay"
                    data-id="${loan.id}"
                    title="Abonar">
              <i class="fa-solid fa-dollar-sign"></i>
            </button>

            <button class="btn danger btn-action btn-trash ${canDelete ? "" : "disabled"}"
        data-action="delete"
        data-id="${loan.id}"
        title="${canDelete
          ? "Eliminar"
          : "No se puede eliminar este registro"}">
  <i class="fa-solid fa-trash"></i>
</button>
            </div>
          </td>
        `;

        tableBody.appendChild(tr);
      });
      // ✅ aplicar rojo inmediatamente después de renderizar
      applyOverdueStylesLive();
    } catch (err) {
      console.error("Error renderLoans:", err);
      tableBody.innerHTML =
        "<tr><td colspan='11'>Error de conexión</td></tr>";
    }
  }

  // ============================
// ✅ Overdue watcher (rojo inmediato sin re-login)
// ============================
function applyOverdueStylesLive() {
  const now = new Date();

  // Recorremos filas actuales (solo están los open en la tabla)
  const rows = tableBody.querySelectorAll("tr");
  rows.forEach((tr) => {
    const endIso = tr.dataset.endIso;
    if (!endIso) return;

    const endDate = new Date(endIso);
    if (Number.isNaN(endDate.getTime())) return;

    const isOverdue = endDate < now;

    // ✅ si ya se venció, pinta; si no, quita
    tr.classList.toggle("tr-loan-overdue", isOverdue);
  });
}

// Timer: revisa cada 10s (puedes subir a 30s si quieres menos trabajo)
let overdueTimer = null;

function startOverdueWatcher() {
  if (overdueTimer) clearInterval(overdueTimer);

  applyOverdueStylesLive();
  refreshLoanDeleteButtonsLive();

  overdueTimer = setInterval(() => {
    applyOverdueStylesLive();
    refreshLoanDeleteButtonsLive();
  }, 2000);
}

let overdueVisibilityBound = false;

// Cuando vuelves a la pestaña, actualiza de inmediato
if (!overdueVisibilityBound) {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      applyOverdueStylesLive();
    }
  });
  overdueVisibilityBound = true;
}

    // Listener ÚNICO para botones de la tabla de préstamos
  tableBody.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const loanId = Number(btn.dataset.id);
    if (!loanId && loanId !== 0) return;

    const loan = currentLoans.find((l) => l.id === loanId);
    if (!loan) return;

    if (action === "delete") {
      const client = currentClientsById.get(loan.clientId);
      const clientName = client ? client.fullName : "este cliente";

      // Verificamos de nuevo si aún se puede eliminar
      const canDelete = isWithinTimeWindow(loan.startDate);

      if (!canDelete) {
        showToast(
          "No se puede eliminar este registro. El tiempo de eliminación (5 minutos) ya expiró.",
          "error"
        );
        return;
      }

      openLoanDeleteModal(loan, clientName);
      return;
    }

    if (action === "pay") {
      const client = currentClientsById.get(loan.clientId) || null;
      openLoanPaymentModal(loan, client);
    }
  });



 // ----- Modal de abonos -----
const loanPaymentModal = document.getElementById("loan-payment-modal");
const lpClient = document.getElementById("lp-client");
const lpCedula = document.getElementById("lp-cedula");
const lpInitial = document.getElementById("lp-initial");
const lpRemaining = document.getElementById("lp-remaining");
const lpDaily = document.getElementById("lp-daily");
const lpPending = document.getElementById("lp-pending");
const lpNewAmount = document.getElementById("lp-new-amount");
const lpAddBtn = document.getElementById("lp-add-btn");
const lpCloseBtn = document.getElementById("lp-close-btn");   // X
const lpCancelBtn = document.getElementById("lp-cancel-btn"); // botón "Salir"
const lpPaymentsList = document.getElementById("lp-payments-list");
const lpActionsHead = document.getElementById("lp-actions-head");

let LP_CURRENT_LOAN = null;
let lpDeleteWatcher = null;

function openLoanPaymentModal(loan, client) {
  if (!loan) return;

  LP_CURRENT_LOAN = loan;
  lpClient.textContent = client ? client.full_name || client.fullName || "-" : "-";
  lpCedula.textContent = loan.clientId;
  lpInitial.textContent = `$${Number(loan.totalAmount).toFixed(2)}`;
  lpRemaining.textContent = `$${Number(loan.remainingAmount).toFixed(2)}`;

  const endDate = new Date(loan.endDate);
  const isOverdue = !Number.isNaN(endDate.getTime()) && endDate < new Date();

  lpDaily.textContent = `$${Number(
    isOverdue ? loan.remainingAmount : loan.dailyPayment
  ).toFixed(2)}`;
  lpPending.textContent = `$${Number(loan.remainingAmount).toFixed(2)}`;

  lpNewAmount.value = "";
  loanPaymentModal.classList.remove("hidden");
  loadLoanPayments(loan.id);
}

function closeLoanPaymentModal() {
  LP_CURRENT_LOAN = null;
  loanPaymentModal.classList.add("hidden");

  if (lpDeleteWatcher) {
    clearTimeout(lpDeleteWatcher);
    lpDeleteWatcher = null;
  }
}

// Cerrar con la X
if (lpCloseBtn) {
  lpCloseBtn.addEventListener("click", () => {
    closeLoanPaymentModal();
  });
}

// Cerrar con el botón "Salir"
if (lpCancelBtn) {
  lpCancelBtn.addEventListener("click", () => {
    closeLoanPaymentModal();
  });
}

// Cerrar haciendo clic en el fondo oscuro
if (loanPaymentModal) {
  const lpBackdrop = loanPaymentModal.querySelector(".modal-backdrop");
  if (lpBackdrop) {
    lpBackdrop.addEventListener("click", () => {
      closeLoanPaymentModal();
    });
  }
}

async function loadLoanPayments(loanId) {
  lpPaymentsList.innerHTML = "";
  try {
    const resp = await apiGet(`/api/loans/${loanId}/payments`);
    if (!resp.ok) {
      lpPaymentsList.innerHTML =
        '<li class="lp-payments-empty">No se pudieron cargar los abonos</li>';
      return;
    }
    const payments = resp.payments || [];
renderPaymentsList(payments);
scheduleLoanPaymentsRefresh(payments);
  } catch (err) {
    console.error(err);
    lpPaymentsList.innerHTML =
      '<li class="lp-payments-empty">Error de conexión</li>';
  }
}

function scheduleLoanPaymentsRefresh(payments) {
  if (lpDeleteWatcher) {
    clearTimeout(lpDeleteWatcher);
    lpDeleteWatcher = null;
  }

  if (!Array.isArray(payments) || !payments.length || !LP_CURRENT_LOAN) return;

  const nextExpiryMs = payments
    .map((p) => getRemainingTimeWindowMs(p.created_at))
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b)[0];

  if (!Number.isFinite(nextExpiryMs)) return;

  lpDeleteWatcher = setTimeout(async () => {
    if (!loanPaymentModal.classList.contains("hidden") && LP_CURRENT_LOAN) {
      await loadLoanPayments(LP_CURRENT_LOAN.id);
    }
  }, nextExpiryMs + 120);
}


function renderPaymentsList(payments) {
  lpPaymentsList.innerHTML = "";

  if (!payments.length) {
    if (lpActionsHead) lpActionsHead.classList.add("hidden");

    const li = document.createElement("li");
    li.classList.add("lp-payments-empty");
    li.textContent = "Sin abonos registrados.";
    lpPaymentsList.appendChild(li);
    return;
  }

  const sorted = payments
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const anyDeletable = sorted.some((p) => isWithinTimeWindow(p.created_at));

  if (lpActionsHead) {
    lpActionsHead.classList.toggle("hidden", !anyDeletable);
  }

  sorted.forEach((p, index) => {
    const li = document.createElement("li");
    const abonoNumber = index + 1;
    const canDelete = isWithinTimeWindow(p.created_at);

    li.innerHTML = `
      <span>${abonoNumber}</span>
      <span>$${Number(p.amount).toFixed(2)}</span>
      <span>${formatDateTime(p.created_at)}</span>
      <span class="${anyDeletable ? "" : "hidden"}" data-lp-actions-cell>
        ${
          canDelete
            ? `
        <button
          class="btn danger btn-action btn-trash lp-delete-btn"
          data-payid="${p.id}"
          aria-label="Eliminar abono #${abonoNumber}"
        >
          <i class="fa-solid fa-trash"></i>
        </button>
        `
            : ""
        }
      </span>
    `;

    const deleteBtn = li.querySelector(".lp-delete-btn");

    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        if (!isWithinTimeWindow(p.created_at)) {
          showToast(
            "Solo puedes eliminar un abono durante los primeros 5 minutos después de registrarlo.",
            "error"
          );
          await loadLoanPayments(LP_CURRENT_LOAN.id);
          return;
        }

        const payId = Number(p.id);
        try {
          const del = await apiDelete(`/api/payments/${payId}`);
          if (!del.ok) {
            showToast(del.message || "No se pudo eliminar el abono.", "error");
            return;
          }

          showToast("Abono eliminado.", "success");
await loadLoanPayments(LP_CURRENT_LOAN.id);
await refreshLoansAfterChange();

if (window.__refreshGeneralMovements) {
  await window.__refreshGeneralMovements();
}

          const loanResp = await apiGet("/api/loans");
          const updatedLoan =
            loanResp.loans &&
            loanResp.loans.find((l) => l.id === LP_CURRENT_LOAN.id);

          if (updatedLoan) {
            LP_CURRENT_LOAN = updatedLoan;
            lpRemaining.textContent = `$${Number(
              updatedLoan.remainingAmount
            ).toFixed(2)}`;
            lpPending.textContent = `$${Number(
              updatedLoan.remainingAmount
            ).toFixed(2)}`;
            lpDaily.textContent = `$${Number(
              updatedLoan.dailyPayment
            ).toFixed(2)}`;
          }
        } catch (err) {
          console.error(err);
          showToast("Error al eliminar abono.", "error");
        }
      });
    }

    lpPaymentsList.appendChild(li);
  });
}



// boton ABONAR dentro del modal
if (lpAddBtn) {
  lpAddBtn.addEventListener("click", async () => {
    const val = lpNewAmount.value.trim().replace(",", ".");
    const amount = Number(val);

    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Ingresa un monto válido", "error");
      return;
    }
    if (!LP_CURRENT_LOAN) return;

    // 1) Llamada a la API (si falla aquí, sí mostramos error)
    let resp;
    try {
      resp = await apiPost("/api/loans/abonar", {
        loanId: LP_CURRENT_LOAN.id,
        amount,
      });
    } catch (err) {
      console.error(err);
      showToast("Error al abonar.", "error");
      return;
    }

    if (!resp.ok) {
      showToast(resp.message || "No se pudo aplicar el abono", "error");
      return;
    }

    // 2) Actualizar la UI. Si algo falla aquí, NO mostramos error de abono.
    try {
      // recargar historial de abonos
      await loadLoanPayments(LP_CURRENT_LOAN.id);

      // refrescar tabla principal de préstamos
      await refreshLoansAfterChange();

      // obtener el préstamo actualizado
      const loanResp = await apiGet("/api/loans");
      const updatedLoan =
        loanResp.loans &&
        loanResp.loans.find((l) => l.id === LP_CURRENT_LOAN.id);

      if (updatedLoan) {
        LP_CURRENT_LOAN = updatedLoan;
        lpRemaining.textContent = `$${Number(
          updatedLoan.remainingAmount
        ).toFixed(2)}`;
        lpPending.textContent = `$${Number(
          updatedLoan.remainingAmount
        ).toFixed(2)}`;
        lpDaily.textContent = `$${Number(
          updatedLoan.dailyPayment
        ).toFixed(2)}`;
      }

            const remaining = Number(LP_CURRENT_LOAN.remainingAmount || 0);

      if (remaining <= 0.01) {
  showToast("Préstamo finalizado.", "success");
  closeLoanPaymentModal();

  if (window.__refreshClientsAndLoans) {
    await window.__refreshClientsAndLoans();
  }

  if (window.__refreshGeneralMovements) {
    await window.__refreshGeneralMovements();
  }
} else {
        // ✅ solo un abono normal
        showToast("Abono registrado.", "success");
lpNewAmount.value = "";

if (window.__refreshGeneralMovements) {
  await window.__refreshGeneralMovements();
}
      }

    } catch (err) {
      console.error("Error actualizando la interfaz tras el abono:", err);
      // La API ya respondió OK, así que mantenemos mensaje de éxito
      showToast("Abono registrado.", "success");
    }
  });
}



// helper para recargar loans y reflejar remaining en tabla
async function refreshLoansAfterChange() {
  try {
    await renderLoans();
  } catch (err) {
    console.error("refreshLoansAfterChange error:", err);
  }
}



  // ===== Guardar
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorLabel.textContent = "";

    const clientId = clientSelect.value.trim();
    const principal = safeParseMoney(amountInput.value);
    const endDateOnly = endDateInput.value; // yyyy-mm-dd
    const interestRate = parseInterest();

    if (!clientId) {
      errorLabel.textContent = "Selecciona un cliente.";
      return;
    }
    if (!principal || principal <= 0) {
      errorLabel.textContent = "Ingresa un monto válido.";
      return;
    }
    if (!endDateOnly) {
      errorLabel.textContent = "Selecciona la fecha fin del préstamo.";
      return;
    }


 // Fecha/hora de inicio: ahora (ISO, 24h, con segundos)
const now = new Date();
const startDate = now.toISOString();

// Fecha de fin: mismo día elegido con la MISMA hora que el inicio
const [endYear, endMonth, endDay] = endDateOnly.split("-").map(Number);
const endDateObj = new Date(
  endYear,
  endMonth - 1,
  endDay,
  now.getHours(),
  now.getMinutes(),
  now.getSeconds(),
  now.getMilliseconds()
);
const endDate = endDateObj.toISOString();

// Cálculo total y pago diario
const totalAmount = Number(
  (principal * (1 + interestRate / 100)).toFixed(2)
);

// OJO: usamos fecha LOCAL para contar días
const startDateOnly = getLocalDateOnly(now); // yyyy-mm-dd local
const numDays = diffDays(startDateOnly, endDateOnly);
const dailyPayment = Number((totalAmount / numDays).toFixed(2));


    try {
      const resp = await apiPost("/api/loans", {
        clientId,
        ownerUserId: CURRENT_SESSION.userId,
        principal,
        interestRate,
        startDate,
        endDate,
        totalAmount,
        dailyPayment,
      });
      if (!resp.ok) {
        errorLabel.textContent = resp.message || "No se pudo registrar el préstamo.";
        return;
      }
      showToast("Préstamo registrado correctamente.", "success");
closeModal();
await renderLoans();

if (window.__refreshGeneralMovements) {
  await window.__refreshGeneralMovements();
}
    } catch (err2) {
      console.error(err2);
      errorLabel.textContent = "Error de conexión con el servidor.";
      showToast("Error de conexión con el servidor.", "error");
    }
  });

  // Carga inicial tabla
renderLoans().then(() => {
  startOverdueWatcher(); // ✅ rojo inmediato sin re-login
});
}

// ============================
// SECCIÓN CAJA CHICA
// ============================

function initCashboxSection() {
  const section = document.getElementById("section-cashbox");
  if (!section) return;

  const openBtn = document.getElementById("btn-open-cashbox-modal");
  const tableBody = document.querySelector("#cashbox-table tbody");
  const actionsHead = document.getElementById("cashbox-actions-head");

const filterStart = document.getElementById("cashbox-date-start");
const filterEnd = document.getElementById("cashbox-date-end");
const filterClear = document.getElementById("cashbox-filter-clear");

const cashboxCalendarStartEl = document.getElementById("cashbox-calendar-start");
const cashboxCalendarEndEl = document.getElementById("cashbox-calendar-end");

let cashboxCalendarStart = null;
let cashboxCalendarEnd = null;

  const modal = document.getElementById("cashbox-modal");
  const form = document.getElementById("cashbox-form");
  const amountInput = document.getElementById("cashbox-amount");
  const descriptionInput = document.getElementById("cashbox-description");
  const formError = document.getElementById("cashbox-form-error");
  const cancelBtn = document.getElementById("cashbox-cancel");
  const lendBtn = document.getElementById("cashbox-lend-btn");
  const addBtn = document.getElementById("cashbox-add-btn");

  const confirmModal = document.getElementById("cashbox-confirm-modal");
  const confirmTitle = document.getElementById("cashbox-confirm-title");
  const confirmMessage = document.getElementById("cashbox-confirm-message");
  const confirmCancel = document.getElementById("cashbox-confirm-cancel");
  const confirmAccept = document.getElementById("cashbox-confirm-accept");

  const deleteModal = document.getElementById("cashbox-delete-modal");
  const deleteMessage = document.getElementById("cashbox-delete-message");
  const deleteCancel = document.getElementById("cashbox-delete-cancel");
  const deleteConfirm = document.getElementById("cashbox-delete-confirm");

  if (!tableBody || !modal || !amountInput || !descriptionInput) return;

  let pendingCashboxType = null;
  let cashboxPendingDeletion = null;
  let currentCashboxRows = [];

function hideCashboxCalendars() {
  hideCalendarPopover(cashboxCalendarStartEl);
  hideCalendarPopover(cashboxCalendarEndEl);
}

function setupCashboxCalendar(which) {
  if (typeof FullCalendar === "undefined") return;

  const isStart = which === "start";
  const targetEl = isStart ? cashboxCalendarStartEl : cashboxCalendarEndEl;
  if (!targetEl) return;

  let calendarInstance = isStart ? cashboxCalendarStart : cashboxCalendarEnd;

  if (!calendarInstance) {
    calendarInstance = new FullCalendar.Calendar(targetEl, {
      height: "auto",
      contentHeight: "auto",
      initialView: "dayGridMonth",
      locale: "es",
      firstDay: 1,
      headerToolbar: {
        left: "prev,next",
        center: "title",
        right: ""
      },
     dateClick(info) {
  consumeUiEvent(info.jsEvent);
  const selected = formatDateYYYYMMDD(info.date);

  if (isStart) {
    filterStart.value = selected;
  } else {
    filterEnd.value = selected;
  }

  dismissCalendarAfterSelection(hideCashboxCalendars);
  loadCashbox();
}
    });

   if (isStart) cashboxCalendarStart = calendarInstance;
else cashboxCalendarEnd = calendarInstance;

requestAnimationFrame(() => {
  calendarInstance.render();
  calendarInstance.updateSize();
});
  } else {
    calendarInstance.render();
    calendarInstance.updateSize();
  }
}

function showCashboxCalendar(which) {
  hideCashboxCalendars();

  if (which === "start" && cashboxCalendarStartEl) {
    setupCashboxCalendar("start");
    showCalendarPopover(cashboxCalendarStartEl, filterStart, cashboxCalendarStart);
  }

  if (which === "end" && cashboxCalendarEndEl) {
    setupCashboxCalendar("end");
    showCalendarPopover(cashboxCalendarEndEl, filterEnd, cashboxCalendarEnd);
  }
}

  function resetCashboxForm() {
    if (form) form.reset();
    amountInput.value = "";
    descriptionInput.value = "";
    formError.textContent = "";
    pendingCashboxType = null;
  }

  function openCashboxModal() {
    resetCashboxForm();
    modal.classList.remove("hidden");
  }

  function closeCashboxModal() {
    modal.classList.add("hidden");
    pendingCashboxType = null;
  }

function openConfirmModal(type) {
  const amount = Number(String(amountInput.value).replace(",", "."));

  if (!Number.isFinite(amount) || amount <= 0) {
    formError.textContent = "Ingresa una cantidad válida.";
    return;
  }

  pendingCashboxType = type;

  const actionLabel = type === "ingreso" ? "ingresar" : "prestar";

  if (confirmTitle) {
    confirmTitle.textContent =
      type === "ingreso"
        ? "Confirmar ingreso"
        : "Confirmar préstamo";
  }

  if (confirmMessage) {
    confirmMessage.textContent =
      `¿Estás seguro de ${actionLabel} $${amount.toFixed(2)}?`;
  }

  confirmModal.classList.remove("hidden");
}

  function closeConfirmModal() {
    confirmModal.classList.add("hidden");
  }

  function openDeleteModal(row) {
    cashboxPendingDeletion = row;
    if (deleteMessage) {
      deleteMessage.textContent =
        `¿Deseas eliminar este movimiento de ${row.type} por $${Number(row.amount).toFixed(2)}?`;
    }
    deleteModal.classList.remove("hidden");
  }

  function closeDeleteModal() {
    deleteModal.classList.add("hidden");
    cashboxPendingDeletion = null;
  }

  function buildCashboxQuery() {
    const params = new URLSearchParams();

    if (filterStart && filterStart.value) {
      params.set("startDate", filterStart.value);
    }

    if (filterEnd && filterEnd.value) {
      params.set("endDate", filterEnd.value);
    }

    const query = params.toString();
    return query ? `/api/cashbox?${query}` : "/api/cashbox";
  }

  function canDeleteCashboxMovement(row) {
    return isWithinTimeWindow(row.createdAt);
  }

  function updateCashboxActionsVisibility(rows) {
    const anyDeletable = rows.some((row) => canDeleteCashboxMovement(row));

    if (actionsHead) {
      actionsHead.classList.toggle("hidden", !anyDeletable);
    }

    tableBody.querySelectorAll("[data-cashbox-actions-cell]").forEach((td) => {
      td.classList.toggle("hidden", !anyDeletable);
    });
  }

  async function loadCashbox() {
    try {
      const resp = await apiGet(buildCashboxQuery());

      if (!resp.ok) {
        tableBody.innerHTML =
          "<tr><td colspan='5'>Error cargando movimientos</td></tr>";
        return;
      }

      currentCashboxRows = resp.movements || [];
      renderCashboxTable(currentCashboxRows);
    } catch (err) {
      console.error("Error loadCashbox:", err);
      tableBody.innerHTML =
        "<tr><td colspan='5'>Error de conexión</td></tr>";
    }
  }

  function renderCashboxTable(rows) {
    tableBody.innerHTML = "";

        if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td colspan="5">No hay movimientos registrados en ese rango.</td>
      `;
      tableBody.appendChild(tr);

      if (actionsHead) actionsHead.classList.add("hidden");
      return;
    }

    const anyDeletable = rows.some((row) => canDeleteCashboxMovement(row));
    if (actionsHead) {
      actionsHead.classList.toggle("hidden", !anyDeletable);
    }

    rows.forEach((row) => {
      const tr = document.createElement("tr");
      const deletable = canDeleteCashboxMovement(row);

      const typeLabel = row.type === "ingreso" ? "Ingreso" : "Prestamo";
      const typeClass =
        row.type === "ingreso" ? "type-ingreso" : "type-prestamo";

      tr.innerHTML = `
        <td>${row.description ? row.description : "-"}</td>
        <td>${formatDateTime(row.createdAt)}</td>
        <td>
          <span class="cashbox-type-pill ${typeClass}">
            ${typeLabel}
          </span>
        </td>
        <td>$${Number(row.amount).toFixed(2)}</td>
        <td data-cashbox-actions-cell class="${anyDeletable ? "" : "hidden"}">
          ${
            deletable
              ? `
            <button
  class="btn danger btn-action btn-trash"
  type="button"
  data-cashbox-delete-id="${row.id}"
  title="Eliminar movimiento"
>
  <i class="fa-solid fa-trash"></i>
</button>
          `
              : ""
          }
        </td>
      `;

      tableBody.appendChild(tr);
    });
  }

  async function submitCashboxMovement() {
    const amount = Number(String(amountInput.value).replace(",", "."));
    const description = descriptionInput.value.trim();

    if (!pendingCashboxType) return;

    try {
      const resp = await apiPost("/api/cashbox", {
        type: pendingCashboxType,
        amount,
        description,
      });

      if (!resp.ok) {
        formError.textContent =
          resp.message || "No se pudo registrar el movimiento.";
        closeConfirmModal();
        return;
      }

      closeConfirmModal();
      closeCashboxModal();

      showToast(
        pendingCashboxType === "ingreso"
          ? "Ingreso registrado correctamente."
          : "Prestamo registrado correctamente.",
        "success"
      );

      await loadCashbox();

if (window.__refreshGeneralMovements) {
  await window.__refreshGeneralMovements();
}
    } catch (err) {
      console.error("Error submitCashboxMovement:", err);
      closeConfirmModal();
      formError.textContent = "Error de conexión con el servidor.";
      showToast("Error de conexión con el servidor.", "error");
    }
  }

  if (openBtn) {
    openBtn.addEventListener("click", openCashboxModal);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", closeCashboxModal);
  }

  if (modal) {
    const backdrop = modal.querySelector(".modal-backdrop");
    if (backdrop) {
      backdrop.addEventListener("click", closeCashboxModal);
    }
  }

  amountInput.addEventListener("input", () => {
    const original = amountInput.value;
    const cleaned = original.replace(/[^0-9.,]/g, "");

    if (original !== cleaned) {
      amountInput.value = cleaned;
      formError.textContent =
        "La cantidad solo puede contener números, puntos (.) y comas (,).";
    } else if (
      formError.textContent.startsWith("La cantidad solo puede")
    ) {
      formError.textContent = "";
    }
  });

  if (lendBtn) {
    lendBtn.addEventListener("click", () => {
      formError.textContent = "";
      openConfirmModal("prestamo");
    });
  }

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      formError.textContent = "";
      openConfirmModal("ingreso");
    });
  }

  if (confirmCancel) {
    confirmCancel.addEventListener("click", closeConfirmModal);
  }

  if (confirmModal) {
    const backdrop = confirmModal.querySelector(".modal-backdrop");
    if (backdrop) {
      backdrop.addEventListener("click", closeConfirmModal);
    }
  }

  if (confirmAccept) {
    confirmAccept.addEventListener("click", submitCashboxMovement);
  }

  if (deleteCancel) {
    deleteCancel.addEventListener("click", closeDeleteModal);
  }

  if (deleteModal) {
    const backdrop = deleteModal.querySelector(".modal-backdrop");
    if (backdrop) {
      backdrop.addEventListener("click", closeDeleteModal);
    }
  }

  if (deleteConfirm) {
    deleteConfirm.addEventListener("click", async () => {
      if (!cashboxPendingDeletion) return;

      if (!isWithinTimeWindow(cashboxPendingDeletion.createdAt)) {
        showToast(
          "No se puede eliminar este movimiento. El tiempo de eliminación (5 minutos) ya expiró.",
          "error"
        );
        closeDeleteModal();
        await loadCashbox();
        return;
      }

      try {
        const resp = await apiDelete(
          `/api/cashbox/${cashboxPendingDeletion.id}`
        );

        if (!resp.ok) {
          showToast(
            resp.message || "No se pudo eliminar el movimiento.",
            "error"
          );
          closeDeleteModal();
          await loadCashbox();
          return;
        }

       showToast("Movimiento eliminado correctamente.", "success");
closeDeleteModal();
await loadCashbox();

if (window.__refreshGeneralMovements) {
  await window.__refreshGeneralMovements();
}
      } catch (err) {
        console.error("Error delete cashbox:", err);
        showToast("Error de conexión con el servidor.", "error");
      }
    });
  }


if (filterClear) {
  filterClear.addEventListener("click", async () => {
    filterStart.value = "";
    filterEnd.value = "";
    hideCashboxCalendars();
    await loadCashbox();
  });
}

if (filterStart) {
  filterStart.addEventListener("focus", () => showCashboxCalendar("start"));
  filterStart.addEventListener("click", () => showCashboxCalendar("start"));
}

if (filterEnd) {
  filterEnd.addEventListener("focus", () => showCashboxCalendar("end"));
  filterEnd.addEventListener("click", () => showCashboxCalendar("end"));
}

document.addEventListener("click", (ev) => {
  const target = ev.target;

  const clickedInsideStart =
    cashboxCalendarStartEl && cashboxCalendarStartEl.contains(target);
  const clickedInsideEnd =
    cashboxCalendarEndEl && cashboxCalendarEndEl.contains(target);

  const clickedOnStart = filterStart && target === filterStart;
  const clickedOnEnd = filterEnd && target === filterEnd;

  if (!clickedInsideStart && !clickedInsideEnd && !clickedOnStart && !clickedOnEnd) {
    hideCashboxCalendars();
  }
});

  tableBody.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-cashbox-delete-id]");
    if (!btn) return;

    const rowId = Number(btn.dataset.cashboxDeleteId);
    const row = currentCashboxRows.find((item) => Number(item.id) === rowId);
    if (!row) return;

    if (!canDeleteCashboxMovement(row)) {
      showToast(
        "No se puede eliminar este movimiento. El tiempo de eliminación (5 minutos) ya expiró.",
        "error"
      );
      loadCashbox();
      return;
    }

    openDeleteModal(row);
  });

  // watcher liviano para ocultar acciones cuando pasen los 5 minutos
let cashboxDeleteWatcher = null;

if (cashboxDeleteWatcher) {
  clearInterval(cashboxDeleteWatcher);
}

cashboxDeleteWatcher = setInterval(() => {
  if (!currentCashboxRows.length) return;

  updateCashboxActionsVisibility(currentCashboxRows);

  tableBody.querySelectorAll("[data-cashbox-delete-id]").forEach((btn) => {
    const rowId = Number(btn.dataset.cashboxDeleteId);
    const row = currentCashboxRows.find((item) => Number(item.id) === rowId);

    if (!row || !canDeleteCashboxMovement(row)) {
      btn.remove();
    }
  });
}, 2000);

  loadCashbox();
}

// ============================
// SECCIÓN MOVIMIENTOS
// ============================

function initMovementsSection() {
  const section = document.getElementById("section-movements");
  const container = document.getElementById("movements-list");

  const filterStart = document.getElementById("movements-date-start");
  const filterEnd = document.getElementById("movements-date-end");
  const filterClear = document.getElementById("movements-filter-clear");

  const calendarStartEl = document.getElementById("movements-calendar-start");
  const calendarEndEl = document.getElementById("movements-calendar-end");

  const loadMoreWrap = document.getElementById("movements-load-more-wrap");
  const loadMoreBtn = document.getElementById("movements-load-more");

  if (!section || !container) return;

  let allMovementRows = [];
  let movementsCalendarStart = null;
  let movementsCalendarEnd = null;
  let nextCursorMonth = null;
  let isFilterMode = false;
  let isLoadingMore = false;

  function hideMovementsCalendars() {
    hideCalendarPopover(calendarStartEl);
    hideCalendarPopover(calendarEndEl);
  }

  function updateLoadMoreVisibility() {
    if (!loadMoreWrap) return;

    const shouldShow = !isFilterMode && !!nextCursorMonth && allMovementRows.length > 0;
    loadMoreWrap.classList.toggle("hidden", !shouldShow);
  }

  function setupMovementsCalendar(which) {
    if (typeof FullCalendar === "undefined") return;

    const isStart = which === "start";
    const targetEl = isStart ? calendarStartEl : calendarEndEl;
    if (!targetEl) return;

    let instance = isStart ? movementsCalendarStart : movementsCalendarEnd;

    if (!instance) {
      instance = new FullCalendar.Calendar(targetEl, {
        height: "auto",
        contentHeight: "auto",
        initialView: "dayGridMonth",
        locale: "es",
        firstDay: 1,
        headerToolbar: {
          left: "prev,next",
          center: "title",
          right: ""
        },
        dateClick(info) {
  consumeUiEvent(info.jsEvent);
  const selected = formatDateYYYYMMDD(info.date);

  if (isStart) {
    filterStart.value = selected;
  } else {
    filterEnd.value = selected;
  }

  dismissCalendarAfterSelection(hideMovementsCalendars);
  loadMovementsFiltered();
}
      });

     if (isStart) movementsCalendarStart = instance;
else movementsCalendarEnd = instance;

requestAnimationFrame(() => {
  instance.render();
  instance.updateSize();
});
    } else {
      instance.render();
      instance.updateSize();
    }
  }

function showMovementsCalendar(which) {
  hideMovementsCalendars();

  if (which === "start" && calendarStartEl) {
    setupMovementsCalendar("start");
    showCalendarPopover(calendarStartEl, filterStart, movementsCalendarStart);
  }

  if (which === "end" && calendarEndEl) {
    setupMovementsCalendar("end");
    showCalendarPopover(calendarEndEl, filterEnd, movementsCalendarEnd);
  }
}

function formatMovementDateTitle(dateStr) {
  if (!dateStr) return "";

  const parts = String(dateStr).split("-");
  if (parts.length !== 3) return dateStr;

  const [year, month, day] = parts.map(Number);
  const d = new Date(year, month - 1, day);

  if (Number.isNaN(d.getTime())) return dateStr;

  return d.toLocaleDateString("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

  function getPrettyMovementTitle(item) {
    const clientName = String(item.clientFullName || "").trim();

    if (item.sourceType === "loan") {
      if (clientName) return `Préstamo entregado a: ${clientName}`;
      return "Préstamo entregado";
    }

    if (item.sourceType === "loan_payment") {
      if (clientName) return `Abono recibido de: ${clientName}`;
      return "Abono recibido";
    }

    if (item.sourceType === "cashbox") {
      return item.movementType === "credit"
        ? "Ingreso en caja chica"
        : "Préstamo desde caja chica";
    }

    return item.description || "Movimiento";
  }

  function renderMovements(rows) {
    container.innerHTML = "";

    if (!rows.length) {
      container.innerHTML = `<div class="card">No hay movimientos registrados.</div>`;
      updateLoadMoreVisibility();
      return;
    }

   const grouped = new Map();

rows
  .slice()
  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  .forEach((row) => {
    const key = getLocalDateKey(row.createdAt);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });

    for (const [dateKey, items] of grouped.entries()) {
      const block = document.createElement("div");
      block.className = "movement-date-group";

     const title = document.createElement("h3");
title.className = "movement-date-title";
title.textContent = formatMovementDateTitle(dateKey);

      const card = document.createElement("div");
      card.className = "movement-group-card";

      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "movement-row";

        const isPositive = item.movementType === "credit";
        const prettyTitle = getPrettyMovementTitle(item);

        row.innerHTML = `
          <div class="movement-desc">
            <div class="movement-desc-title">${prettyTitle}</div>
            <div class="movement-desc-sub">${formatDateTime(item.createdAt)}</div>
          </div>

          <div class="movement-amount ${isPositive ? "positive" : "negative"}">
            ${isPositive ? "+" : "-"}$${Number(item.amount).toFixed(2)}
          </div>

          <div class="movement-balance">
            $${Number(item.balance).toFixed(2)}
          </div>
        `;

        card.appendChild(row);
      });

      block.appendChild(title);
      block.appendChild(card);
      container.appendChild(block);
    }

    updateLoadMoreVisibility();
  }

  async function loadMovementsInitial() {
    try {
      isFilterMode = false;

      const resp = await apiGet("/api/movements");
      if (!resp.ok) {
        container.innerHTML = `<div class="card">Error cargando movimientos.</div>`;
        return;
      }

      allMovementRows = resp.movements || [];
      nextCursorMonth = resp.nextCursorMonth || null;
      renderMovements(allMovementRows);
    } catch (err) {
      console.error("Error loadMovementsInitial:", err);
      container.innerHTML = `<div class="card">Error de conexión.</div>`;
    }
  }

  async function loadMoreMovements() {
    if (!nextCursorMonth || isLoadingMore) return;

    try {
      isLoadingMore = true;
      loadMoreBtn && (loadMoreBtn.disabled = true);

      const resp = await apiGet(
        `/api/movements?cursorMonth=${encodeURIComponent(nextCursorMonth)}`
      );

      if (!resp.ok) {
        showToast("No se pudo cargar el mes anterior.", "error");
        return;
      }

      const newRows = resp.movements || [];
      nextCursorMonth = resp.nextCursorMonth || null;

      allMovementRows = allMovementRows.concat(newRows);

      allMovementRows.sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );

      renderMovements(allMovementRows);
    } catch (err) {
      console.error("Error loadMoreMovements:", err);
      showToast("Error de conexión cargando más movimientos.", "error");
    } finally {
      isLoadingMore = false;
      loadMoreBtn && (loadMoreBtn.disabled = false);
      updateLoadMoreVisibility();
    }
  }

  async function loadMovementsFiltered() {
    try {
      const params = new URLSearchParams();

      if (filterStart?.value) params.set("startDate", filterStart.value);
      if (filterEnd?.value) params.set("endDate", filterEnd.value);

      isFilterMode = !!(filterStart?.value || filterEnd?.value);

      const url = params.toString()
        ? `/api/movements?${params.toString()}`
        : "/api/movements";

      const resp = await apiGet(url);
      if (!resp.ok) {
        container.innerHTML = `<div class="card">Error cargando movimientos.</div>`;
        return;
      }

      allMovementRows = resp.movements || [];
      nextCursorMonth = isFilterMode ? null : resp.nextCursorMonth || null;
      renderMovements(allMovementRows);
    } catch (err) {
      console.error("Error loadMovementsFiltered:", err);
      container.innerHTML = `<div class="card">Error de conexión.</div>`;
    }
  }

  if (filterClear) {
    filterClear.addEventListener("click", () => {
      filterStart.value = "";
      filterEnd.value = "";
      hideMovementsCalendars();
      loadMovementsInitial();
    });
  }

  if (filterStart) {
    filterStart.addEventListener("focus", () => showMovementsCalendar("start"));
    filterStart.addEventListener("click", () => showMovementsCalendar("start"));
  }

  if (filterEnd) {
    filterEnd.addEventListener("focus", () => showMovementsCalendar("end"));
    filterEnd.addEventListener("click", () => showMovementsCalendar("end"));
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", loadMoreMovements);
  }

  document.addEventListener("click", (ev) => {
    const target = ev.target;

    const clickedInsideStart =
      calendarStartEl && calendarStartEl.contains(target);
    const clickedInsideEnd =
      calendarEndEl && calendarEndEl.contains(target);

    const clickedOnStart = filterStart && target === filterStart;
    const clickedOnEnd = filterEnd && target === filterEnd;

    if (
      !clickedInsideStart &&
      !clickedInsideEnd &&
      !clickedOnStart &&
      !clickedOnEnd
    ) {
      hideMovementsCalendars();
    }
  });

  loadMovementsInitial();
  window.__refreshGeneralMovements = loadMovementsInitial;
}
// ============================
// INICIALIZACIÓN GLOBAL
// ============================

document.addEventListener("DOMContentLoaded", () => {
  initModalDividers();
  initPasswordToggles();
  initLoginPage();
  initDashboard();
});


