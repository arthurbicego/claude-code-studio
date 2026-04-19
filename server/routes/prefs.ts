import type { Express, Request, Response } from 'express';
import { appState, sanitizePrefs, saveState } from '../state';

export function register(app: Express): void {
  app.get('/api/prefs', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    res.json(appState.prefs);
  });

  app.put('/api/prefs', (req: Request, res: Response) => {
    appState.prefs = sanitizePrefs(req.body);
    saveState(appState);
    res.json(appState.prefs);
  });
}
