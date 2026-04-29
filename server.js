const fs = require("fs");
const path = require("path");

const app = require(path.join(resolveAppDirectory(), "server"));

const port = Number(process.env.PORT || 3000);

if (require.main === module) {
  app.ready.finally(() => {
    app.listen(port, () => {
      console.log(`Servidor rodando em http://localhost:${port}`);
    });
  });
}

module.exports = app;
module.exports.ready = app.ready;

function resolveAppDirectory() {
  const candidates = ["SEMANA ACADÊMICA", "SEMANA ACADEMICA"];

  for (const candidate of candidates) {
    const absolutePath = path.join(__dirname, candidate);

    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  throw new Error("Não foi possível localizar a pasta principal da aplicação.");
}
