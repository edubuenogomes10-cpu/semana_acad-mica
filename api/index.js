const app = require("../server");

module.exports = async (req, res) => {
  await app.ready;
  return app(req, res);
};
