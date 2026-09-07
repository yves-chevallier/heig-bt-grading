import { expect, test } from '@playwright/test';
import { password } from '../fixtures';

test('connexion depuis 127.0.0.1 avec PUBLIC_URL configurée sur localhost', async ({ page }) => {
  await page.goto('http://127.0.0.1:3100/');
  await page.getByLabel('Adresse e-mail administrateur').fill('admin@example.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mes évaluations' })).toBeVisible();
  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible();
});
