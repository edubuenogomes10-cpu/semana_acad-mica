const app = require("../SEMANA ACADÊMICA/server");

module.exports = async (req, res) => {
  await app.ready;
  return app(req, res);
};
