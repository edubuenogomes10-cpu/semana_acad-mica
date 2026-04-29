const app = require("./SEMANA ACADÊMICA/server");

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
