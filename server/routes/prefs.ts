import type { Express, Request, Response } from 'express';
import { runArchivePurge } from '../purge';
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

  app.post('/api/prefs/archive-purge/run', async (_req: Request, res: Response) => {
    const purged = await runArchivePurge();
    res.json({ purged });
  });
}
