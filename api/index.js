const app = require("../server");

module.exports = async (req, res) => {
  try {
    await app.ready;
    return app(req, res);
  } catch (error) {
    console.error("Erro no handler da Vercel:", error);
    res.status(500).json({
      message: error?.message || "Não foi possível processar a solicitação."
    });
  }
};
