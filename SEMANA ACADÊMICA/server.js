require("dotenv").config();

const express = require("express");
const multer = require("multer");
const { Pool } = require("pg");
const QRCode = require("qrcode");
const fs = require("fs");
const os = require("os");
const path = require("path");

const app = express();
const port = Number(process.env.PORT || 3000);
const isVercel = Boolean(process.env.VERCEL);
const baseRuntimeDir = isVercel
  ? path.join(os.tmpdir(), "semana-academica")
  : __dirname;
const uploadsDir = path.join(baseRuntimeDir, "uploads");
const dataDir = path.join(baseRuntimeDir, "data");
const fallbackDatabaseFile = path.join(dataDir, "registrations.json");
const adminPassword = process.env.ADMIN_PASSWORD || "Ideau@2026";
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || "";

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

if (!fs.existsSync(fallbackDatabaseFile)) {
  fs.writeFileSync(fallbackDatabaseFile, "[]\n", "utf8");
}

const pool = createDatabasePool();

const upload = multer({
  storage: multer.memoryStorage(),
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

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.get(["/styles.css", "/script.js", "/admin.js", "/index.html", "/admin.html"], (req, res) => {
  res.sendFile(path.join(__dirname, path.basename(req.path)));
});

let activeStorageMode = "file";
let storageApi;
let storageError = null;

app.get("/api/health", async (_req, res) => {
  await ready;
  res.status(storageError ? 500 : 200).json({
    ok: !storageError,
    storage: activeStorageMode,
    error: storageError?.message || null
  });
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

app.get("/api/registrations", requireAdminPassword, async (_req, res) => {
  try {
    if (!await ensureStorageReady(res)) {
      return;
    }

    const rows = await storageApi.listRegistrations();
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Não foi possível listar as inscrições." });
  }
});

app.patch("/api/registrations/:id/status", requireAdminPassword, async (req, res) => {
  try {
    if (!await ensureStorageReady(res)) {
      return;
    }

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

app.get("/api/registrations/:id/proof", requireAdminPassword, async (req, res) => {
  try {
    if (!await ensureStorageReady(res)) {
      return;
    }

    const registrationId = Number(req.params.id);

    if (!registrationId) {
      res.status(400).json({ message: "Inscrição inválida." });
      return;
    }

    const proof = await storageApi.getRegistrationProof(registrationId);

    if (!proof) {
      res.status(404).json({ message: "Comprovante não encontrado." });
      return;
    }

    if (proof.buffer) {
      res.setHeader("Content-Type", proof.mimeType || "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeDownloadName(proof.originalName || "comprovante")}"`
      );
      res.send(proof.buffer);
      return;
    }

    res.download(proof.filePath, proof.originalName || path.basename(proof.filePath));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Não foi possível carregar o comprovante." });
  }
});

app.post("/api/registrations", upload.single("paymentProof"), async (req, res) => {
  try {
    if (!await ensureStorageReady(res)) {
      return;
    }

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
      proofOriginalName: req.file.originalname,
      proofMimeType: req.file.mimetype,
      proofBuffer: req.file.buffer
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

async function ensureStorageReady(res) {
  await ready;

  if (storageError || !storageApi) {
    res.status(503).json({
      message: storageError?.message || "Banco de dados indisponível no momento."
    });
    return false;
  }

  return true;
}

async function createStorageApi() {
  try {
    if (!pool) {
      if (isVercel) {
        throw new Error("Banco de dados não configurado no Vercel.");
      }

      activeStorageMode = "file";
      console.warn("Banco de dados não configurado. Usando armazenamento local em arquivo.");
      return createFileStorage();
    }

    await pool.query("SELECT 1");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registrations (
        id BIGSERIAL PRIMARY KEY,
        course VARCHAR(100) NOT NULL,
        student_name VARCHAR(255) NOT NULL,
        cpf VARCHAR(20) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(30) NOT NULL,
        pix_payload TEXT NOT NULL,
        receiver_name VARCHAR(255) NOT NULL,
        pix_key VARCHAR(255) NOT NULL,
        amount NUMERIC(10,2) NOT NULL,
        payment_status VARCHAR(50) NOT NULL DEFAULT 'aguardando_conferencia',
        proof_original_name VARCHAR(255) NOT NULL,
        proof_mime_type VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
        proof_data BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await ensurePgColumn("proof_original_name", "VARCHAR(255) NOT NULL DEFAULT 'comprovante'");
    await ensurePgColumn("proof_mime_type", "VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream'");
    await ensurePgColumn("proof_data", "BYTEA");
    await dropPgColumnIfExists("proof_path");

    activeStorageMode = "postgres";
    console.log("Storage ativo: Postgres/Supabase");
    return createPostgresStorage();
  } catch (error) {
    if (isVercel) {
      console.error("Postgres indisponível em produção:", error.message);
      throw error;
    }

    activeStorageMode = "file";
    console.warn("Postgres indisponível. Usando armazenamento local em arquivo.");
    return createFileStorage();
  }
}

function createPostgresStorage() {
  return {
    async listRegistrations() {
      const { rows } = await pool.query(`
        SELECT
          id,
          course,
          student_name AS "studentName",
          cpf,
          email,
          phone,
          payment_status AS "paymentStatus",
          proof_original_name AS "proofOriginalName",
          created_at AS "createdAt"
        FROM registrations
        ORDER BY created_at DESC
      `);

      return rows.map((row) => ({
        ...row,
        proofPath: `/api/registrations/${row.id}/proof`
      }));
    },

    async createRegistration(registration) {
      const { rows } = await pool.query(
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
            proof_original_name,
            proof_mime_type,
            proof_data
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id
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
          registration.proofOriginalName,
          registration.proofMimeType,
          registration.proofBuffer
        ]
      );

      return { id: rows[0].id };
    },

    async updateStatus(id, status) {
      const result = await pool.query(
        "UPDATE registrations SET payment_status = $1 WHERE id = $2",
        [status, id]
      );

      return Boolean(result.rowCount);
    },

    async getRegistrationProof(id) {
      const { rows } = await pool.query(
        `
          SELECT
            proof_original_name AS "originalName",
            proof_mime_type AS "mimeType",
            proof_data AS "proofData"
          FROM registrations
          WHERE id = $1
          LIMIT 1
        `,
        [id]
      );

      if (!rows.length) {
        return null;
      }

      return {
        originalName: rows[0].originalName,
        mimeType: rows[0].mimeType,
        buffer: rows[0].proofData
      };
    }
  };
}

function createFileStorage() {
  return {
    async listRegistrations() {
      const rows = await readFallbackRegistrations();
      return rows
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map((row) => ({
          ...row,
          proofPath: `/api/registrations/${row.id}/proof`
        }));
    },

    async createRegistration(registration) {
      const rows = await readFallbackRegistrations();
      const nextId = rows.reduce((highest, row) => Math.max(highest, Number(row.id) || 0), 0) + 1;
      const proofStoredName = await saveProofToDisk(registration.proofOriginalName, registration.proofBuffer);
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
        proofOriginalName: registration.proofOriginalName,
        proofMimeType: registration.proofMimeType,
        proofStoredName,
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
    },

    async getRegistrationProof(id) {
      const rows = await readFallbackRegistrations();
      const target = rows.find((row) => Number(row.id) === Number(id));

      if (!target?.proofStoredName) {
        return null;
      }

      return {
        originalName: target.proofOriginalName,
        filePath: path.join(uploadsDir, target.proofStoredName)
      };
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

function createDatabasePool() {
  if (databaseUrl) {
    return new Pool({
      connectionString: databaseUrl,
      ssl: isVercel ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      keepAlive: true
    });
  }

  return null;
}

async function ensurePgColumn(columnName, definition) {
  const result = await pool.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'registrations' AND column_name = $1
    `,
    [columnName]
  );

  if (!result.rowCount) {
    await pool.query(`ALTER TABLE registrations ADD COLUMN ${columnName} ${definition}`);
  }
}

async function dropPgColumnIfExists(columnName) {
  const result = await pool.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'registrations' AND column_name = $1
    `,
    [columnName]
  );

  if (result.rowCount) {
    await pool.query(`ALTER TABLE registrations DROP COLUMN ${columnName}`);
  }
}

async function saveProofToDisk(originalName, buffer) {
  const timestamp = Date.now();
  const safeOriginal = String(originalName || "comprovante").replace(/[^a-zA-Z0-9._-]/g, "-");
  const storedName = `${timestamp}-${safeOriginal}`;
  const fullPath = path.join(uploadsDir, storedName);
  await fs.promises.writeFile(fullPath, buffer);
  return storedName;
}

function encodeDownloadName(value) {
  return String(value).replace(/"/g, "");
}

const ready = createStorageApi()
  .then((api) => {
    storageApi = api;
    storageError = null;
    return app;
  })
  .catch((error) => {
    storageApi = null;
    storageError = error;
    activeStorageMode = "error";
    console.error("Erro ao iniciar o backend:", error.message);
    return app;
  });

if (require.main === module) {
  ready
    .finally(() => {
      app.listen(port, () => {
        console.log(`Servidor rodando em http://localhost:${port}`);
      });
    });
}

module.exports = app;
module.exports.ready = ready;
