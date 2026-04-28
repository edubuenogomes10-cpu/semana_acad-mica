const tableBody = document.getElementById("registrationsTableBody");
const registrationCount = document.getElementById("registrationCount");
const courseFilter = document.getElementById("courseFilter");
const logoutButton = document.getElementById("logoutButton");
const adminAuthCard = document.getElementById("adminAuthCard");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminPasswordInput = document.getElementById("adminPassword");
const authMessage = document.getElementById("authMessage");

const ADMIN_PASSWORD_KEY = "semana-academica-admin-password";
let allRegistrations = [];

if (getSavedPassword()) {
  unlockAdmin();
  loadRegistrations().catch(handleAuthError);
}

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = adminPasswordInput.value;
  authMessage.textContent = "Validando senha...";

  try {
    await loadRegistrations(password);
    savePassword(password);
    unlockAdmin();
    adminPasswordInput.value = "";
    authMessage.textContent = "Acesso liberado.";
  } catch (error) {
    handleAuthError(error);
  }
});

courseFilter.addEventListener("change", () => {
  renderRegistrations();
});

logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem(ADMIN_PASSWORD_KEY);
  allRegistrations = [];
  registrationCount.textContent = "0 inscritos";
  tableBody.innerHTML = '<tr><td colspan="7">Faça login para visualizar as inscrições.</td></tr>';
  adminAuthCard.classList.remove("hidden");
  authMessage.textContent = "O painel administrativo está protegido por senha.";
});

tableBody.addEventListener("click", async (event) => {
  const proofLink = event.target.closest("a.proof-link[data-proof-path]");
  if (proofLink) {
    event.preventDefault();

    try {
      await openProofFile(proofLink.dataset.proofPath, proofLink.dataset.proofName || "comprovante");
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  const button = event.target.closest("button[data-id][data-status]");
  if (!button) {
    return;
  }

  const { id, status } = button.dataset;
  button.disabled = true;

  try {
    const response = await fetch(`/api/registrations/${id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": getSavedPassword()
      },
      body: JSON.stringify({ status })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "Não foi possível atualizar o status.");
    }

    await loadRegistrations();
  } catch (error) {
    alert(error.message);
    button.disabled = false;
  }
});

async function loadRegistrations(password = getSavedPassword()) {
  const response = await fetch("/api/registrations", {
    headers: {
      "x-admin-password": password || ""
    }
  });
  const registrations = await response.json();

  if (!response.ok) {
    throw new Error(registrations.message || "Não foi possível carregar as inscrições.");
  }

  allRegistrations = registrations;
  renderRegistrations();
}

function renderRegistrations() {
  const selectedCourse = courseFilter.value;
  const filteredRegistrations = selectedCourse === "todos"
    ? allRegistrations
    : allRegistrations.filter((registration) => registration.course === selectedCourse);

  registrationCount.textContent = `${filteredRegistrations.length} inscritos`;

  if (!filteredRegistrations.length) {
    tableBody.innerHTML = '<tr><td colspan="7">Nenhuma inscrição encontrada para esse curso.</td></tr>';
    return;
  }

  tableBody.innerHTML = filteredRegistrations
    .map((registration) => {
      const createdAt = new Date(registration.createdAt);
      const formattedDate = Number.isNaN(createdAt.getTime())
        ? "-"
        : createdAt.toLocaleString("pt-BR");

      return `
        <tr>
          <td>
            <strong>${escapeHtml(registration.studentName)}</strong><br />
            <span>${escapeHtml(registration.cpf)}</span>
          </td>
          <td>${escapeHtml(registration.course)}</td>
          <td>
            <span>${escapeHtml(registration.email)}</span><br />
            <span>${escapeHtml(registration.phone)}</span>
          </td>
          <td>${formattedDate}</td>
          <td><span class="status-pill ${statusClassName(registration.paymentStatus)}">${formatStatus(registration.paymentStatus)}</span></td>
          <td><a class="proof-link" href="${registration.proofPath}" data-proof-path="${escapeHtml(registration.proofPath)}" data-proof-name="${escapeHtml(registration.proofOriginalName)}">${escapeHtml(registration.proofOriginalName)}</a></td>
          <td>
            <div class="action-group">
              <button type="button" class="table-action confirm-action" data-id="${registration.id}" data-status="pago_confirmado">Confirmar</button>
              <button type="button" class="table-action reject-action" data-id="${registration.id}" data-status="recusado">Recusar</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function formatStatus(status) {
  if (status === "aguardando_conferencia") {
    return "Aguardando conferência";
  }

  if (status === "pago_confirmado") {
    return "Pago confirmado";
  }

  if (status === "recusado") {
    return "Recusado";
  }

  return status || "-";
}

function statusClassName(status) {
  if (status === "pago_confirmado") {
    return "is-confirmed";
  }

  if (status === "recusado") {
    return "is-rejected";
  }

  return "is-pending";
}

function savePassword(password) {
  sessionStorage.setItem(ADMIN_PASSWORD_KEY, password);
}

function getSavedPassword() {
  return sessionStorage.getItem(ADMIN_PASSWORD_KEY) || "";
}

function unlockAdmin() {
  adminAuthCard.classList.add("hidden");
}

async function openProofFile(proofPath, proofName) {
  const proofWindow = window.open("", "_blank");

  if (!proofWindow) {
    throw new Error("O navegador bloqueou a abertura do comprovante. Permita pop-ups e tente de novo.");
  }

  proofWindow.opener = null;
  proofWindow.document.title = proofName;
  proofWindow.document.body.innerHTML = "<p style=\"font-family: sans-serif; padding: 16px;\">Carregando comprovante...</p>";

  const response = await fetch(proofPath, {
    headers: {
      "x-admin-password": getSavedPassword()
    }
  });

  if (!response.ok) {
    let message = "Não foi possível abrir o comprovante.";

    try {
      const result = await response.json();
      message = result.message || message;
    } catch {
      // Keep the fallback message when the response is not JSON.
    }

    proofWindow.close();
    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  proofWindow.location.href = objectUrl;
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function handleAuthError(error) {
  sessionStorage.removeItem(ADMIN_PASSWORD_KEY);
  adminAuthCard.classList.remove("hidden");
  authMessage.textContent = error.message;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
