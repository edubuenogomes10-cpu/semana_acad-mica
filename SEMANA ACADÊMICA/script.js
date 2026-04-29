const DEFAULT_PIX_CONFIG = Object.freeze({
  receiverName: "Semana Acadêmica",
  city: "Balsas",
  pixKey: "pix@semanaacademica.com",
  description: "Inscrição Semana Acadêmica",
  amount: 40,
  txidPrefix: "SEMANA"
});

const COURSE_PIX_CONFIG = Object.freeze({
  CSA: Object.freeze({
    receiverName: "ALISSON T CHAGAS",
    city: "BAGE",
    pixKey: "b7a378b9-61c0-4d3c-994a-419f3b82aa6f",
    description: "Pagamento Semana Academica 2026",
    amount: 40,
    txidPrefix: "CSA"
  }),
  Direito: Object.freeze({
    receiverName: "Marcos Gularte Gomes",
    city: "SAO PAULO",
    pixKey: "7578454c-f82c-4102-b528-8dce13bb9fb9",
    description: "Pagamento Semana Acadêmica 2026",
    amount: 40,
    txidPrefix: "DIREITO"
  }),
  Agronomia: Object.freeze({
    receiverName: "MATHEUS VIEIRA CARDOZO",
    city: "BRASILIA",
    pixKey: "8b959e9f-f3f7-4e01-ac58-952586c8a56b",
    description: "Semana acadêmica Agronomia",
    amount: 40,
    txidPrefix: "AGRONOMIA"
  }),
  Psicologia: Object.freeze({
    receiverName: "Giovana Beck Saracol",
    city: "SAO PAULO",
    pixKey: "+5553999458649",
    description: "Pagamento Semana Acadêmica 2026",
    amount: 40,
    txidPrefix: "PSICOLOGIA"
  })
});

const form = document.getElementById("registrationForm");
const generatePixButton = document.getElementById("generatePixButton");
const copyPixButton = document.getElementById("copyPixButton");
const pixArea = document.getElementById("pixArea");
const pixPayloadField = document.getElementById("pixPayload");
const paymentProofWrap = document.getElementById("paymentProofWrap");
const paymentProofInput = document.getElementById("paymentProof");
const proofPreview = document.getElementById("proofPreview");
const proofFileName = document.getElementById("proofFileName");
const proofFileMeta = document.getElementById("proofFileMeta");
const finishButton = document.getElementById("finishButton");
const statusMessage = document.getElementById("statusMessage");
const successCard = document.getElementById("successCard");
const successMessage = document.getElementById("successMessage");
const steps = document.querySelectorAll(".progress-step");
const cpfInput = document.getElementById("cpf");
const phoneInput = document.getElementById("phone");
const courseSelect = document.getElementById("course");
const studentNameInput = document.getElementById("studentName");
const summaryAmount = document.getElementById("summaryAmount");
const qrCodeCanvas = document.getElementById("qrcodeCanvas");
const qrCodeImage = document.getElementById("qrcodeImage");

let paymentGenerated = false;
let lastPixPayload = "";

updateSummary();

cpfInput.addEventListener("input", () => {
  cpfInput.value = formatCpf(cpfInput.value);
});

phoneInput.addEventListener("input", () => {
  phoneInput.value = formatPhone(phoneInput.value);
});

courseSelect.addEventListener("change", () => {
  updateSummary();
  invalidateGeneratedPayment("Curso alterado. Gere o Pix novamente para evitar um QR Code desatualizado.");
  setStepState(0);
});

studentNameInput.addEventListener("input", () => {
  invalidateGeneratedPayment("Nome alterado. Gere o Pix novamente para manter o pagamento sincronizado.");
});

paymentProofInput.addEventListener("change", () => {
  const file = paymentProofInput.files?.[0];

  if (!file) {
    proofPreview.classList.add("hidden");
    finishButton.disabled = true;
    setStepState(paymentGenerated ? 2 : 1);
    statusMessage.textContent = paymentGenerated
      ? "Pagamento gerado. Agora envie o comprovante para liberar a inscrição."
      : "Preencha os dados, gere o pagamento e anexe o comprovante para continuar.";
    return;
  }

  proofFileName.textContent = file.name;
  proofFileMeta.textContent = `${formatFileSize(file.size)} • ${file.type || "arquivo enviado"}`;
  proofPreview.classList.remove("hidden");
  finishButton.disabled = !paymentGenerated;
  setStepState(3);
  statusMessage.textContent = "Comprovante anexado. Agora você pode enviar a inscrição.";
});

generatePixButton.addEventListener("click", async () => {
  if (!form.reportValidity()) {
    statusMessage.textContent = "Preencha todos os campos obrigatórios antes de gerar o pagamento.";
    return;
  }

  const formData = new FormData(form);
  const studentName = String(formData.get("studentName") || "").trim();
  const course = String(formData.get("course") || "").trim();

  try {
    const pixConfig = getPixConfig(course);

    validatePixConfig(pixConfig, course);

    const payload = buildPixPayload({
      pixKey: pixConfig.pixKey,
      receiverName: pixConfig.receiverName,
      city: pixConfig.city,
      description: `${pixConfig.description} - ${course}`,
      amount: pixConfig.amount,
      txid: buildTxid(studentName, course, pixConfig.txidPrefix)
    });

    paymentGenerated = true;
    lastPixPayload = payload;
    pixPayloadField.value = payload;
    pixArea.classList.remove("hidden");
    paymentProofWrap.classList.remove("hidden");
    finishButton.disabled = !paymentProofInput.files?.length;
    setStepState(2);
    statusMessage.textContent = "Pix gerado. Pague, anexe o comprovante e finalize a inscrição.";

    await renderQrCode(payload);
  } catch (error) {
    console.error(error);
    statusMessage.textContent = error.message || "Não foi possível gerar o QR Code agora. Tente novamente.";
  }
});

copyPixButton.addEventListener("click", async () => {
  if (!pixPayloadField.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(pixPayloadField.value);
    statusMessage.textContent = "Código Pix copiado com sucesso.";
  } catch {
    pixPayloadField.select();
    document.execCommand("copy");
    statusMessage.textContent = "Código Pix copiado.";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!paymentGenerated) {
    statusMessage.textContent = "Gere o pagamento Pix antes de enviar a inscrição.";
    return;
  }

  const proofFile = paymentProofInput.files?.[0];
  if (!proofFile) {
    statusMessage.textContent = "Anexe o comprovante antes de enviar a inscrição.";
    return;
  }

  const formData = new FormData(form);
  const studentName = formData.get("studentName");
  const course = formData.get("course");
  const pixConfig = getPixConfig(course);
  try {
    validatePixConfig(pixConfig, String(course || ""));
  } catch (error) {
    statusMessage.textContent = error.message;
    return;
  }

  formData.append("pixPayload", lastPixPayload);
  formData.append("receiverName", pixConfig.receiverName);
  formData.append("pixKey", pixConfig.pixKey);
  formData.append("amount", String(pixConfig.amount));

  finishButton.disabled = true;
  statusMessage.textContent = "Enviando inscrição e comprovante...";

  try {
    const response = await fetch("/api/registrations", {
      method: "POST",
      body: formData
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "Não foi possível enviar a inscrição.");
    }

    successCard.classList.remove("hidden");
    successMessage.textContent = `${studentName}, sua inscrição em ${course} foi recebida com o comprovante ${proofFile.name}. O status inicial é aguardando conferência.`;
    statusMessage.textContent = "Inscrição salva com sucesso.";

    form.reset();
    resetPaymentState();
    updateSummary();
    setStepState(0);
    successCard.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    finishButton.disabled = false;
    statusMessage.textContent = error.message;
  }
});

function invalidateGeneratedPayment(message) {
  if (!paymentGenerated) {
    return;
  }

  resetPaymentState();
  statusMessage.textContent = message;
}

function resetPaymentState() {
  paymentGenerated = false;
  lastPixPayload = "";
  pixArea.classList.add("hidden");
  paymentProofWrap.classList.add("hidden");
  paymentProofInput.value = "";
  proofPreview.classList.add("hidden");
  finishButton.disabled = true;

  if (qrCodeCanvas) {
    const context = qrCodeCanvas.getContext("2d");
    context?.clearRect(0, 0, qrCodeCanvas.width, qrCodeCanvas.height);
    qrCodeCanvas.classList.remove("hidden");
  }

  if (qrCodeImage) {
    qrCodeImage.removeAttribute("src");
    qrCodeImage.classList.add("hidden");
  }
}

function getPixConfig(course) {
  return {
    ...DEFAULT_PIX_CONFIG,
    ...(COURSE_PIX_CONFIG[course] || {})
  };
}

function validatePixConfig(pixConfig, course) {
  const requiredFields = [
    ["receiverName", pixConfig.receiverName],
    ["city", pixConfig.city],
    ["pixKey", pixConfig.pixKey],
    ["description", pixConfig.description]
  ];

  for (const [fieldName, value] of requiredFields) {
    if (!String(value || "").trim()) {
      throw new Error(`A configuração do Pix para ${course || "o curso selecionado"} está incompleta: ${fieldName}.`);
    }
  }

  if (!Number.isFinite(pixConfig.amount) || Number(pixConfig.amount) <= 0) {
    throw new Error(`O valor do Pix para ${course || "o curso selecionado"} é inválido.`);
  }
}

function updateSummary() {
  const selectedCourse = courseSelect.value;
  const pixConfig = getPixConfig(selectedCourse);
  summaryAmount.textContent = formatCurrency(pixConfig.amount);
}

async function renderQrCode(payload) {
  if (!qrCodeImage) {
    throw new Error("Não foi possível preparar o QR Code nesta página.");
  }

  const response = await fetch("/api/qrcode", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ payload })
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Não foi possível gerar o QR Code.");
  }

  qrCodeCanvas?.classList.add("hidden");
  qrCodeImage.classList.remove("hidden");
  qrCodeImage.src = result.dataUrl;
}

function setStepState(activeIndex) {
  steps.forEach((step, index) => {
    step.classList.toggle("active", index <= activeIndex);
  });
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function onlyDigits(value) {
  return value.replace(/\D/g, "");
}

function formatCpf(value) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatPhone(value) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function buildTxid(studentName, course, txidPrefix = DEFAULT_PIX_CONFIG.txidPrefix) {
  const base = `${txidPrefix}${studentName}${course}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 19);
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);

  return `${base || "SEMANA"}${suffix}`.slice(0, 25);
}

function buildPixPayload({ pixKey, receiverName, city, description, amount, txid }) {
  const pixKeyField = formatField("01", pixKey);
  const maxMerchantAccountLength = 99;
  const staticMerchantAccountLength = formatField("00", "br.gov.bcb.pix").length + pixKeyField.length;
  const maxDescriptionLength = Math.max(0, Math.min(72, maxMerchantAccountLength - staticMerchantAccountLength - 4));
  const sanitizedDescription = sanitizePixText(description, maxDescriptionLength);
  const merchantAccount = [
    formatField("00", "br.gov.bcb.pix"),
    pixKeyField,
    formatField("02", sanitizedDescription)
  ].join("");

  const payloadWithoutCrc = [
    formatField("00", "01"),
    formatField("26", merchantAccount),
    formatField("52", "0000"),
    formatField("53", "986"),
    formatField("54", Number(amount).toFixed(2)),
    formatField("58", "BR"),
    formatField("59", sanitizePixText(receiverName, 25)),
    formatField("60", sanitizePixText(city, 15)),
    formatField("62", formatField("05", txid)),
    "6304"
  ].join("");

  const crc = crc16(payloadWithoutCrc);
  return `${payloadWithoutCrc}${crc}`;
}

function formatField(id, value) {
  const normalizedValue = String(value);
  const size = String(normalizedValue.length).padStart(2, "0");
  return `${id}${size}${normalizedValue}`;
}

function sanitizePixText(value, maxLength) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .slice(0, maxLength)
    .toUpperCase();
}

function crc16(value) {
  let crc = 0xffff;

  for (let i = 0; i < value.length; i += 1) {
    crc ^= value.charCodeAt(i) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }

      crc &= 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}
