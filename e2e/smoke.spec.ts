import { expect, test } from '@playwright/test';

test('home page loads, renders the sidebar header, and reaches the sessions API', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const sessionsResponse = page.waitForResponse(
    (res) => res.url().endsWith('/api/sessions') && res.status() === 200,
    { timeout: 15_000 },
  );

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Claude Code Studio' })).toBeVisible();
  await sessionsResponse;

  // The empty-state message only renders once the sessions fetch settles — so
  // either we see a project entry or the empty-state, never the "loading" spinner.
  await expect(page.getByText(/Carregando projetos/)).toBeHidden();

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
