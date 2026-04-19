const { appState, saveState, sanitizePrefs } = require('../state');

function register(app) {
  app.get('/api/prefs', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(appState.prefs);
  });

  app.put('/api/prefs', (req, res) => {
    appState.prefs = sanitizePrefs(req.body);
    saveState(appState);
    res.json(appState.prefs);
  });
}

module.exports = { register };
