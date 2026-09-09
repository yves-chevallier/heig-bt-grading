import { expect, test } from '@playwright/test';
import { complete, password } from '../fixtures';
import type { EvaluationRecord } from '../../shared/evaluation';

test('copie le lien, saisit sans connexion et reporte les notes expert jusqu’au verrouillage', async ({
  page,
  browser,
}) => {
  const headers = { Origin: 'http://localhost:3100', 'X-Requested-With': 'evaluation-tb' };
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByLabel('Adresse e-mail administrateur').fill('admin@example.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mes évaluations' })).toBeVisible();
  const response = await page.request.post('/api/evaluations', {
    headers,
    data: { ...complete(), firstName: 'Partage', lastName: 'Expert' },
  });
  expect(response.status()).toBe(201);
  const record = (await response.json()) as EvaluationRecord;
  await page.reload();
  await page
    .getByRole('button', { name: 'Ouvrir l’évaluation de Partage Expert', exact: true })
    .click();
  await page.getByRole('button', { name: 'Copier le lien expert', exact: true }).click();
  // Ciblage explicite de la zone de notice : les <output> de notes ont un rôle
  // « status » implicite, si bien que getByRole('status') en désigne plusieurs.
  await expect(page.locator('.editor-status [role=status]')).toContainText('Lien expert copié');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/^http:\/\/localhost:3100\/expert#[A-Za-z0-9_-]{43}$/);
  const context = await browser.newContext();
  const expert = await context.newPage();
  try {
    await expert.goto(link);
    await expect(
      expert.getByRole('heading', { name: 'Partage Expert', exact: true }),
    ).toBeVisible();
    await expect(expert.getByText('Se connecter', { exact: true })).toHaveCount(0);
    await expect(expert.getByRole('button', { name: 'Générer le PDF' })).toHaveCount(0);
    await expect(expert.getByText('Décisions du jury', { exact: true })).toHaveCount(0);
    await expect(
      expert.getByText('Qualité de la revue de projet et/ou du rapport intermédiaire', {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(expert.getByRole('textbox', { name: /^Note expert/ })).toHaveCount(2);
    await expert
      .getByRole('textbox', {
        name: 'Note expert — Qualité du rapport final et de la documentation',
        exact: true,
      })
      .fill('4.2');
    await expert
      .getByRole('textbox', { name: 'Note expert — Qualité de travail', exact: true })
      .fill('4.8');
    for (const input of await expert.getByRole('textbox', { name: /^Points —/ }).all())
      await input.fill('3');
    await expect(
      expert.getByLabel('Note expert — Qualité de la soutenance', { exact: true }),
    ).toHaveText('4.6');
    await expert
      .getByRole('textbox', { name: /^Remarques —/ })
      .first()
      .fill('Observation de l’expert uniquement.');
    // L'enregistrement est automatique ; on attend l'accusé du serveur.
    await expert.waitForResponse(
      (r) =>
        r.request().method() === 'PUT' &&
        r.url().includes('/api/expert/evaluation') &&
        r.status() === 200,
    );
    await expect(expert.locator('.save-state')).toContainText('Enregistré');
    await expert.reload();
    await expect(
      expert.getByRole('textbox', { name: 'Note expert — Qualité de travail', exact: true }),
    ).toHaveValue('4.8');
    // Aucun déclencheur manuel ici : la page de l'enseignant·e doit se mettre à
    // jour d'elle-même, poussée par le flux SSE. Si le push tombe en panne, ce
    // test échoue au lieu d'être sauvé par un rafraîchissement provoqué.
    await expect(
      page.getByRole('textbox', { name: 'Expert·e — Qualité de travail', exact: true }),
    ).toHaveValue('4.8');
    const fresh = (await (
      await page.request.get(`/api/evaluations/${record.id}`)
    ).json()) as EvaluationRecord;
    expect(fresh.data.teacherMarks).toEqual(record.data.teacherMarks);
    expect(fresh.data.protocol).toEqual(record.data.protocol);
    expect(fresh.data.expertMarks).toEqual([null, null, 4.2, 4.8]);
    const locked = await page.request.post(`/api/evaluations/${record.id}/lock`, {
      headers,
      data: { version: fresh.version, data: fresh.data },
    });
    expect(locked.status()).toBe(200);
    await expert.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      expert.getByRole('textbox', { name: 'Note expert — Qualité de travail', exact: true }),
    ).toBeDisabled();
    // Verrouillée : l'indicateur d'enregistrement disparaît avec la saisie.
    await expect(expert.locator('.save-state')).toHaveCount(0);
    await expert.screenshot({ path: 'test-results/expert-page.png', fullPage: true });
  } finally {
    await context.close();
  }
});
