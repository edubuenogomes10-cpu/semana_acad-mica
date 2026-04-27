require("dotenv").config();

const express = require("express");
const multer = require("multer");
const mysql = require("mysql2/promise");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

const app = express();
const port = Number(process.env.PORT || 3000);
const baseRuntimeDir = process.env.VERCEL
  ? path.join("/tmp", "semana-academica")
  : __dirname;
const uploadsDir = path.join(baseRuntimeDir, "uploads");
const dataDir = path.join(baseRuntimeDir, "data");
const fallbackDatabaseFile = path.join(dataDir, "registrations.json");
const adminPassword = process.env.ADMIN_PASSWORD || "Ideau@2026";

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

if (!fs.existsSync(fallbackDatabaseFile)) {
  fs.writeFileSync(fallbackDatabaseFile, "[]\n", "utf8");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "semanacademica",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-");
    cb(null, `${timestamp}-${safeOriginal}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new Error("Envie um comprovante em PDF, JPG, PNG ou WEBP."));
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadsDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("/:asset(styles.css|script.js|admin.js|index.html|admin.html)", (req, res) => {
  res.sendFile(path.join(__dirname, req.params.asset));
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, storage: activeStorageMode });
});

app.post("/api/qrcode", async (req, res) => {
  try {
    const payload = String(req.body?.payload || "").trim();

    if (!payload) {
      res.status(400).json({ message: "Payload Pix não informado." });
      return;
    }

    const dataUrl = await QRCode.toDataURL(payload, {
      width: 260,
      margin: 2,
      color: {
        dark: "#14221f",
        light: "#ffffff"
      }
    });

    res.json({ dataUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Não foi possível gerar o QR Code." });
  }
});

let activeStorageMode = "file";
let storageApi;

app.use(async (_req, _res, next) => {
  try {
    await ready;
    next();
  } catch (error) {
    next(error);
  }
});

app.get("/api/registrations", requireAdminPassword, async (_req, res) => {
  try {
    const rows = await storageApi.listRegistrations();
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Não foi possível listar as inscrições." });
  }
});

app.patch("/api/registrations/:id/status", requireAdminPassword, async (req, res) => {
  try {
    const registrationId = Number(req.params.id);
    const { status } = req.body;
    const allowedStatuses = ["aguardando_conferencia", "pago_confirmado", "recusado"];

    if (!registrationId || !allowedStatuses.includes(status)) {
      res.status(400).json({ message: "Status informado é inválido." });
      return;
    }

    const updated = await storageApi.updateStatus(registrationId, status);

    if (!updated) {
      res.status(404).json({ message: "Inscrição não encontrada." });
      return;
    }

    res.json({ message: "Status atualizado com sucesso." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Não foi possível atualizar o status." });
  }
});

app.post("/api/registrations", upload.single("paymentProof"), async (req, res) => {
  try {
    const { course, studentName, cpf, email, phone, pixPayload, receiverName, pixKey, amount } = req.body;

    if (!course || !studentName || !cpf || !email || !phone || !pixPayload || !req.file) {
      res.status(400).json({ message: "Preencha todos os campos e anexe o comprovante." });
      return;
    }

    const registration = await storageApi.createRegistration({
      course,
      studentName,
      cpf,
      email,
      phone,
      pixPayload,
      receiverName,
      pixKey,
      amount: Number(amount),
      paymentStatus: "aguardando_conferencia",
      proofPath: `/uploads/${req.file.filename}`,
      proofOriginalName: req.file.originalname
    });

    res.status(201).json({
      id: registration.id,
      message: "Inscrição salva com sucesso e aguardando conferência."
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Não foi possível salvar a inscrição." });
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ message: "O arquivo enviado excede o limite permitido de 8 MB." });
    return;
  }

  if (error) {
    res.status(400).json({ message: error.message || "Não foi possível processar a solicitação." });
    return;
  }

  res.status(500).json({ message: "Erro interno do servidor." });
});

function requireAdminPassword(req, res, next) {
  const providedPassword = req.headers["x-admin-password"];

  if (providedPassword !== adminPassword) {
    res.status(401).json({ message: "Senha do painel inválida." });
    return;
  }

  next();
}

async function createStorageApi() {
  try {
    await pool.query("SELECT 1");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        course VARCHAR(100) NOT NULL,
        student_name VARCHAR(255) NOT NULL,
        cpf VARCHAR(20) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(30) NOT NULL,
        pix_payload TEXT NOT NULL,
        receiver_name VARCHAR(255) NOT NULL,
        pix_key VARCHAR(255) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        payment_status VARCHAR(50) NOT NULL DEFAULT 'aguardando_conferencia',
        proof_path VARCHAR(255) NOT NULL,
        proof_original_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    activeStorageMode = "mysql";
    console.log("Storage ativo: MySQL");
    return createMysqlStorage();
  } catch (error) {
    activeStorageMode = "file";
    console.warn("MySQL indisponível. Usando armazenamento local em arquivo.");
    return createFileStorage();
  }
}

function createMysqlStorage() {
  return {
    async listRegistrations() {
      const [rows] = await pool.query(`
        SELECT
          id,
          course,
          student_name AS studentName,
          cpf,
          email,
          phone,
          payment_status AS paymentStatus,
          proof_original_name AS proofOriginalName,
          proof_path AS proofPath,
          created_at AS createdAt
        FROM registrations
        ORDER BY created_at DESC
      `);

      return rows;
    },

    async createRegistration(registration) {
      const [result] = await pool.query(
        `
          INSERT INTO registrations (
            course,
            student_name,
            cpf,
            email,
            phone,
            pix_payload,
            receiver_name,
            pix_key,
            amount,
            payment_status,
            proof_path,
            proof_original_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          registration.course,
          registration.studentName,
          registration.cpf,
          registration.email,
          registration.phone,
          registration.pixPayload,
          registration.receiverName,
          registration.pixKey,
          registration.amount,
          registration.paymentStatus,
          registration.proofPath,
          registration.proofOriginalName
        ]
      );

      return { id: result.insertId };
    },

    async updateStatus(id, status) {
      const [result] = await pool.query(
        "UPDATE registrations SET payment_status = ? WHERE id = ?",
        [status, id]
      );

      return Boolean(result.affectedRows);
    }
  };
}

function createFileStorage() {
  return {
    async listRegistrations() {
      const rows = await readFallbackRegistrations();
      return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async createRegistration(registration) {
      const rows = await readFallbackRegistrations();
      const nextId = rows.reduce((highest, row) => Math.max(highest, Number(row.id) || 0), 0) + 1;
      const entry = {
        id: nextId,
        course: registration.course,
        studentName: registration.studentName,
        cpf: registration.cpf,
        email: registration.email,
        phone: registration.phone,
        pixPayload: registration.pixPayload,
        receiverName: registration.receiverName,
        pixKey: registration.pixKey,
        amount: registration.amount,
        paymentStatus: registration.paymentStatus,
        proofPath: registration.proofPath,
        proofOriginalName: registration.proofOriginalName,
        createdAt: new Date().toISOString()
      };

      rows.push(entry);
      await writeFallbackRegistrations(rows);
      return entry;
    },

    async updateStatus(id, status) {
      const rows = await readFallbackRegistrations();
      const target = rows.find((row) => Number(row.id) === Number(id));

      if (!target) {
        return false;
      }

      target.paymentStatus = status;
      await writeFallbackRegistrations(rows);
      return true;
    }
  };
}

async function readFallbackRegistrations() {
  const content = await fs.promises.readFile(fallbackDatabaseFile, "utf8");

  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeFallbackRegistrations(rows) {
  await fs.promises.writeFile(fallbackDatabaseFile, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
}

const ready = createStorageApi()
  .then((api) => {
    storageApi = api;
    return app;
  })
  .catch((error) => {
    console.error("Erro ao iniciar o backend:", error.message);
    throw error;
  });

if (require.main === module) {
  ready
    .then(() => {
      app.listen(port, () => {
        console.log(`Servidor rodando em http://localhost:${port}`);
      });
    })
    .catch(() => {
      process.exit(1);
    });
}

module.exports = app;
module.exports.ready = ready;
