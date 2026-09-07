import { expect, test } from '@playwright/test';
import { password, roundingExample } from '../fixtures';

test('pondère les notes affichées : 4.965 donne 5.0 dans les grilles et les PDF', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Adresse e-mail administrateur').fill('admin@example.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mes évaluations' })).toBeVisible();
  const data = { ...roundingExample(), firstName: 'Arrondi', lastName: 'Test' };
  const response = await page.request.post('/api/evaluations', {
    headers: { Origin: 'http://localhost:3100', 'X-Requested-With': 'evaluation-tb' },
    data,
  });
  expect(response.status()).toBe(201);
  await page.reload();
  await page
    .getByRole('button', { name: 'Ouvrir l’évaluation de Arrondi Test', exact: true })
    .click();
  await expect(page.locator('.identity-strip')).toContainText('GE');
  await expect(page.locator('.final-grade')).toContainText('5.0');
  await expect(page.locator('.summary')).toContainText('4.965');
  await expect(page.locator('.common-grade')).toHaveText(['4.5', '5.0', '5.0', '5.3', '4.7']);
  const pdf = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Générer le PDF', exact: true }).click();
  await (await pdf).saveAs('test-results/rounding.pdf');
  const studentPdf = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF étudiant·e', exact: true }).click();
  await (await studentPdf).saveAs('test-results/rounding-etudiant.pdf');
});
