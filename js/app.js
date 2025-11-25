// ============================
// CONFIGURACIÓN Y UTILIDADES
// ============================

const SESSION_KEY = "gestor_am_session";
const DEFAULT_INTEREST_RATE = 10;
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

async function apiGet(path) {
  const res = await fetch(path);
  return res.json();
}

async function apiPost(path, data) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {}),
  });
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(path, { method: "DELETE" });
  return res.json();
}



// --- helpers varios del front ---

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("es-EC");
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


// Para no romper nada que ya use formatDate
function formatDate(dateStr) {
  return formatDateTime(dateStr);
}



function parseMoney(str) {
  if (!str) return NaN;
  const normalized = String(str).replace(",", ".").trim();
  const value = Number(normalized);
  if (!Number.isFinite(value)) return NaN;
  const parts = normalized.split(".");
  if (parts[1] && parts[1].length > 2) return NaN;
  return value;
}



// Helper para diferenciar días (para abonos) SIN contar el mismo día y usando fecha local
function diffDays(from, to) {
  // forzamos a "solo fecha" y 00:00 local en ambos lados
  const fromStr = String(from).slice(0, 10); // yyyy-mm-dd
  const toStr = String(to).slice(0, 10);     // yyyy-mm-dd

  const start = new Date(`${fromStr}T00:00:00`);
  const end = new Date(`${toStr}T00:00:00`);

  // número de días completos entre start y end (como daysBetween del front)
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff);
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


// ============================
// LOGIN
// ============================

function initLoginPage() {
  const form = document.getElementById("login-form");
  if (!form) return;
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
        userId: data.user.id,
        username: data.user.username,
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
  const isAdmin = session.role === "admin";

  // Avatar con iniciales
  const avatarInitialsEl = document.getElementById("user-avatar-initials");
  if (avatarInitialsEl) {
    avatarInitialsEl.textContent = getInitialsFromUsername(session.username);
  }

  const avatarBtn = document.getElementById("user-avatar-btn");
  const dropdown = document.getElementById("user-dropdown");
  const wrapper = document.querySelector(".user-menu-wrapper");
  const changePwdBtn = document.getElementById("btn-change-password");
  const logoutTopBtn = document.getElementById("btn-logout-top");

  function doLogout() {
    setSession(null);
    window.location.href = "index.html";
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
        tdUser.textContent = `${user.username} (${user.role})`;

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

        const editBtn = document.createElement("button");
        editBtn.className = "btn small secondary btn-icon-rect";
        editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
        editBtn.title = "Editar usuario";
        editBtn.addEventListener("click", () => {
          openModalForEdit(user);
        });

        const toggleBtn = document.createElement("button");
toggleBtn.className = "btn small btn-status-toggle";
toggleBtn.style.marginLeft = "6px";

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


        tdActions.appendChild(editBtn);
        tdActions.appendChild(toggleBtn);

        tr.appendChild(tdUser);
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

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const passwordConfirm = passwordConfirmInput
      ? passwordConfirmInput.value.trim()
      : "";
    const role = roleSelect ? roleSelect.value : "user";
    const editingId = idInput.value ? Number(idInput.value) : null;

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
        username,
        // si está vacío en edición, no se cambia la contraseña
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
  const currentUserId = CURRENT_SESSION.userId;

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
    if (!/^\d{10}$/.test(value)) {
      return "La cédula debe tener exactamente 10 dígitos numéricos.";
    }
    return "";
  }

  function validateName(value, label) {
    const trimmed = value.trim();
    if (!trimmed) {
      return `Ingresa ${label.toLowerCase()}.`;
    }
    const regex = /^[A-Za-zÁÉÍÓÚáéíóúÑñ]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñ]+)*$/;
    if (!regex.test(trimmed)) {
      return `${label} solo puede contener letras y espacios (sin números ni caracteres especiales).`;
    }
    return "";
  }

  // -------- carga de datos del servidor --------
  async function loadClientsAndLoans() {
    try {
      const [clientsRes, loansRes] = await Promise.all([
        apiGet(`/api/clients?ownerUserId=${currentUserId}`),
        apiGet(`/api/loans?ownerUserId=${currentUserId}`),
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
const viewBtn = document.createElement("button");
viewBtn.className = "btn small secondary";
viewBtn.innerHTML = `<i class="fa-solid fa-eye"></i>`;
viewBtn.title = "Ver préstamos del cliente";

       viewBtn.addEventListener("click", async () => {
  await openClientDetail(client, clientLoans);
});

        tdActions.appendChild(viewBtn);

        // Botón ELIMINAR
        const deleteBtn = document.createElement("button");
deleteBtn.className = "btn small danger";
deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
deleteBtn.title = "Eliminar préstamo";

        deleteBtn.style.marginLeft = "6px";
        deleteBtn.addEventListener("click", () =>
          handleDeleteClient(client, clientLoans)
        );
        tdActions.appendChild(deleteBtn);

        tr.appendChild(tdId);
        tr.appendChild(tdName);
        tr.appendChild(tdDate);
        tr.appendChild(tdClosed);
        tr.appendChild(tdOpen);
        tr.appendChild(tdActions);

        tableBody.appendChild(tr);
      });
  }


function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");

  // Formato: dd/MM/yyyy HH:mm:ss
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
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
        El cliente no tiene aún tickets cerrados.
      </p>
    `;
    openClientDetailModal(html);
    return;
  }

  // Contenedor general + cabecera tipo tabla
     html += `
    <div class="client-closed-loans">
      <div class="client-closed-loans-header">
        <span>MONTO</span>
        <span>% INT.</span>
        <span>INICIO</span>
        <span>FIN</span>
        <span></span>
      </div>
  `;

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
        <div class="client-closed-loan-row">
          <span>$${Number(loan.principal).toFixed(2)}</span>
          <span>${Number(loan.interestRate).toFixed(2)} %</span>
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
                <th>Monto</th>
                <th>Fecha del abono</th>
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
        const resp = await apiPost("/api/clients/delete", {
          cedula: clientPendingDeletion.id,
          ownerUserId: currentUserId,
        });

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


  clientForm.addEventListener("submit", (e) => {
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


    fetch("/api/clients", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    cedula,
    fullName,
    ownerUserId: currentUserId,
  }),
})
  .then((res) => res.json())
  .then((data) => {
    if (!data.ok) {
      const msg =
        data.message ||
        `El cliente con cédula "${cedula}" ya existe. Intenta con otra cédula.`;
      clientFormError.textContent = msg;
      showToast(msg, "error");
      return;
    }

    showToast("Cliente creado correctamente.", "success");
    closeClientModal();
    loadClientsAndLoans();
  })
  .catch((err) => {
    console.error(err);
    clientFormError.textContent =
      "No se pudo guardar el cliente. Inténtalo de nuevo.";
    showToast("No se pudo guardar el cliente.", "error");
  });


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
  const errorLabel = document.getElementById("loan-form-error");
  const cancelBtn = document.getElementById("loan-cancel");

  const calendarEl = document.getElementById("loan-calendar");
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
          ownerUserId: CURRENT_SESSION.userId,
        });

        if (!resp.ok) {
          showToast(resp.message || "No se pudo eliminar.", "error");
          return;
        }

        showToast("Préstamo eliminado.", "success");
        closeLoanDeleteModal();
        await renderLoans();
      } catch (e) {
        console.error(e);
        showToast("Error de conexión con el servidor.", "error");
      }
    });
  }


  interestInput.value = `${DEFAULT_INTEREST_RATE.toFixed(2)} %`;

  

  if (!openBtn || !modal || !form || !tableBody) return;

  // ===== Helpers de modal

  // Utilidad para formatear fecha a yyyy-mm-dd
  function formatDateYYYYMMDD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

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
    const selectedStr = formatDateYYYYMMDD(info.date);

    if (selectedStr < minStr) return;

    endDateInput.value = selectedStr; // yyyy-mm-dd
    updateDailyEstimate();
    calendarEl.classList.add("hidden");
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
    calendarEl.classList.remove("hidden");
    if (loanCalendar) loanCalendar.updateSize();
  }

  function hideCalendar() {
    if (!calendarEl) return;
    calendarEl.classList.add("hidden");
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
      const ownerUserId = CURRENT_SESSION.userId;
      // /api/clients ya existe
      const res = await apiGet(`/api/clients?ownerUserId=${ownerUserId}`);
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
  intMinus.addEventListener("click", () => setInterest(parseInterest() - 5));
  intPlus.addEventListener("click", () => setInterest(parseInterest() + 5));

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

  function daysBetween(startDateOnlyYYYYMMDD, endDateYYYYMMDD) {
    // 00:00 a 00:00 exclusivas para días completos
    const s = new Date(`${startDateOnlyYYYYMMDD}T00:00:00`);
    const e = new Date(`${endDateYYYYMMDD}T00:00:00`);
    return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)));
  }

 function updateDailyEstimate() {
  const principal = safeParseMoney(amountInput.value);
  const interestRate = parseInterest(); // %

  const todayDateOnly = getLocalDateOnly();  // <-- usamos fecha local
  const end = endDateInput.value;           // yyyy-mm-dd

  if (!principal || !end) {
    dailyInput.value = "";
    return;
  }

  const numDays = daysBetween(todayDateOnly, end); // usa días completos
  const total = Number((principal * (1 + interestRate / 100)).toFixed(2));
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

    // Si el clic NO fue ni en el calendario ni en el input de fecha, lo ocultamos
    if (!clickedInsideCalendar && !clickedOnInput) {
      hideCalendar();
    }
  });


   let currentLoans = [];
  let currentClientsById = new Map();

  // ===== Render tabla
  async function renderLoans() {
    try {
      const ownerUserId = CURRENT_SESSION.userId;

      // Pedimos préstamos y clientes al backend
      const [loansRes, clientsRes] = await Promise.all([
        apiGet(`/api/loans?ownerUserId=${ownerUserId}`),
        apiGet(`/api/clients?ownerUserId=${ownerUserId}`),
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
      const now = new Date();

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

        // Si la fecha FIN ya pasó y sigue "open", pintamos la fila
        if (isOverdue) {
          tr.classList.add("tr-loan-overdue");
        }

        const client = byId.get(loan.clientId);

        // Ventana de 5 minutos para permitir eliminar
        const created = new Date(loan.startDate);
        const diffMs  = now - created;
        const canDelete =
          !isNaN(created.getTime()) && diffMs <= 5 * 60 * 1000;

        tr.innerHTML = `
          <td>${loan.clientId}</td>
          <td>${client ? client.fullName : "-"}</td>
          <td>$${Number(loan.principal).toFixed(2)}</td>
          <td>${Number(loan.interestRate).toFixed(2)} %</td>
          <td>$${Number(loan.totalAmount).toFixed(2)}</td>
          <td>${formatDateTime(loan.startDate)}</td>
          <td>${formatDateTime(loan.endDate)}</td>
          <td>$${Number(loan.dailyPayment).toFixed(2)}</td>
          <td id="loan-remaining-${loan.id}">
            $${Number(loan.remainingAmount).toFixed(2)}
          </td>
          <td>
            <button class="btn pay"
                    data-action="pay"
                    data-id="${loan.id}"
                    title="Abonar">
              <i class="fa-solid fa-dollar-sign"></i>
            </button>

            <button class="btn danger ${canDelete ? "" : "disabled"}"
                    data-action="delete"
                    data-id="${loan.id}"
                    title="${canDelete
                      ? "Eliminar"
                      : "No se puede eliminar este registro"}">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        `;

        tableBody.appendChild(tr);
      });
    } catch (err) {
      console.error("Error renderLoans:", err);
      tableBody.innerHTML =
        "<tr><td colspan='11'>Error de conexión</td></tr>";
    }
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
      const created = new Date(loan.startDate);
      const diffMs = Date.now() - created.getTime();
      const canDelete =
        !isNaN(created.getTime()) && diffMs <= 5 * 60 * 1000;

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

let LP_CURRENT_LOAN = null;

function openLoanPaymentModal(loan, client) {
  if (!loan) return;
  LP_CURRENT_LOAN = loan;
  lpClient.textContent = client ? client.full_name || client.fullName || "-" : "-";
  lpCedula.textContent = loan.clientId;
  lpInitial.textContent = `$${Number(loan.totalAmount).toFixed(2)}`;
  lpRemaining.textContent = `$${Number(loan.remainingAmount).toFixed(2)}`;
  lpDaily.textContent = `$${Number(loan.dailyPayment).toFixed(2)}`;
  lpPending.textContent = `$${Number(loan.remainingAmount).toFixed(2)}`;

  lpNewAmount.value = "";
  loadLoanPayments(loan.id);
  loanPaymentModal.classList.remove("hidden");
}

function closeLoanPaymentModal() {
  LP_CURRENT_LOAN = null;
  loanPaymentModal.classList.add("hidden");
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
  } catch (err) {
    console.error(err);
    lpPaymentsList.innerHTML =
      '<li class="lp-payments-empty">Error de conexión</li>';
  }
}


function renderPaymentsList(payments) {
  lpPaymentsList.innerHTML = "";

  if (!payments.length) {
    const li = document.createElement("li");
    li.classList.add("lp-payments-empty");
    li.textContent = "Sin abonos registrados.";
    lpPaymentsList.appendChild(li);
    return;
  }

  // Ordenados por fecha
  const sorted = payments
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  sorted.forEach((p, index) => {
    const li = document.createElement("li");
    const abonoNumber = index + 1;

    li.innerHTML = `
      <span>${abonoNumber}</span>
      <span>$${Number(p.amount).toFixed(2)}</span>
      <span>${formatDateTime(p.created_at)}</span>
      <span>
        <button
          class="btn small danger lp-delete-btn"
          data-payid="${p.id}"
          aria-label="Eliminar abono #${abonoNumber}"
        >
          <i class="fa-solid fa-trash"></i>
        </button>
      </span>
    `;

    const deleteBtn = li.querySelector(".lp-delete-btn");

    deleteBtn.addEventListener("click", async () => {
      // Revalidar los 5 minutos en el momento del clic
      const diffNow = Date.now() - new Date(p.created_at).getTime();
      if (diffNow > 5 * 60 * 1000) {
        showToast(
          "Solo puedes eliminar un abono durante los primeros 5 minutos después de registrarlo.",
          "error"
        );
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

        // 💥 actualización inmediata en la UI
        // (por si la recarga tarda un poco)
        li.remove();

        // 🔁 Recargar historial del modal para reenumerar # de abono
        await loadLoanPayments(LP_CURRENT_LOAN.id);

        // 🔁 Recargar tabla general de préstamos (y montos pendientes)
        await refreshLoansAfterChange();

        // 🔁 Actualizar también los datos del header del modal
        const loanResp = await apiGet(
          `/api/loans?ownerUserId=${CURRENT_SESSION.userId}`
        );
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
        }
      } catch (err) {
        console.error(err);
        showToast("Error al eliminar abono.", "error");
      }
    });

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
      const loanResp = await apiGet(
        `/api/loans?ownerUserId=${CURRENT_SESSION.userId}`
      );
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
        // ✅ préstamo totalmente cancelado
        showToast("Préstamo finalizado.", "success");
        closeLoanPaymentModal();

        // Recargar clientes en tiempo real si la función está disponible
        if (window.__refreshClientsAndLoans) {
          await window.__refreshClientsAndLoans();
        }
      } else {
        // ✅ solo un abono normal
        showToast("Abono registrado.", "success");
        lpNewAmount.value = "";
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
const numDays = daysBetween(startDateOnly, endDateOnly);
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
    } catch (err2) {
      console.error(err2);
      errorLabel.textContent = "Error de conexión con el servidor.";
      showToast("Error de conexión con el servidor.", "error");
    }
  });

  // Carga inicial tabla
  renderLoans();
}


// ============================
// INICIALIZACIÓN GLOBAL
// ============================

document.addEventListener("DOMContentLoaded", () => {
  initPasswordToggles();
  initLoginPage();
  initDashboard();
});