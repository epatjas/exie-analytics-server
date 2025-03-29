const dashboard = require('./dashboard');

module.exports = (req, res) => {
  // Forward the request to the dashboard handler
  return dashboard(req, res);
}; 