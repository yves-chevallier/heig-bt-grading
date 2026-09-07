import { expect, test } from '@playwright/test';
import { criteria, oralCriteria } from '../../shared/evaluation';
import { password } from '../fixtures';
test('parcours complet : créer, noter, protocole, PDF, verrouiller et relire', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible();
  await page.screenshot({ path: 'test-results/login.png', fullPage: true });
  await page.getByLabel('Adresse e-mail administrateur').fill('admin@example.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mes évaluations' })).toBeVisible();
  await page.getByRole('button', { name: 'Nouvelle évaluation' }).click();
  await page.getByLabel('Prénom *', { exact: true }).fill('Camille');
  await page.getByLabel('Nom *', { exact: true }).fill('Müller');
  await page.getByLabel('Filière *', { exact: true }).fill('GE');
  await page
    .getByLabel('Titre du travail de bachelor *', { exact: true })
    .fill('Commande d’un système énergétique');
  await page.getByLabel('Enseignant·e responsable *', { exact: true }).fill('Alex Martin');
  await page.getByLabel('Expert·e *', { exact: true }).fill('Sam Dupont');
  await page.getByLabel('Date de soutenance *', { exact: true }).fill('2026-09-18');
  await page.getByRole('button', { name: 'Créer l’évaluation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Camille Müller', exact: true })).toBeVisible();
  await expect(page.getByText('Encore 25 % à répartir.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Verrouiller l’évaluation', exact: true }),
  ).toBeDisabled();
  const weights = [10, 20, 20, 30, 20];
  for (const [i, c] of criteria.entries()) {
    await page.getByLabel(`Pondération — ${c.title}`, { exact: true }).fill(String(weights[i]));
    if (i < 4) {
      await page.getByLabel(`Enseignant·e — ${c.title}`, { exact: true }).fill('5,2');
      if (i >= 2) {
        await page.getByLabel(`Expert·e — ${c.title}`, { exact: true }).fill('5.0');
      } else {
        await expect(page.getByLabel(`Expert·e — ${c.title}`, { exact: true })).toHaveCount(0);
      }
    }
  }
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('.editor-status [role=status]')).toContainText(
    'Modifications enregistrées',
  );
  await page.screenshot({ path: 'test-results/grille.png', fullPage: true });
  for (const role of ['Enseignant·e', 'Expert·e']) {
    await page.getByRole('button', { name: `Oral · ${role}`, exact: true }).click();
    await expect(page.getByLabel(/Commentaires globaux/)).toHaveCount(0);
    for (const c of oralCriteria)
      await page.getByLabel(`Points — ${c.title}`, { exact: true }).fill(String(c.max));
    await expect(page.locator('.oral-summary')).toContainText('6.0 / 6');
  }
  await page.getByRole('button', { name: 'Soutenance', exact: true }).click();
  await page
    .getByLabel('Appréciation de la présentation orale', { exact: true })
    .fill('Présentation claire et structurée.');
  await page
    .getByLabel('Questions du jury et qualification des réponses', { exact: true })
    .fill('Le dimensionnement a été expliqué et justifié.');
  await page
    .getByLabel('Évaluation globale de la soutenance', { exact: true })
    .fill('Excellente maîtrise du sujet.');
  await expect(page.locator('.final-grade')).toContainText('5.3');
  await expect(page.locator('.summary')).toContainText('8 / 8');
  await expect(page.getByRole('button', { name: 'Grille étudiant·e', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Grille d’évaluation', exact: true }).click();
  const publication = page.getByRole('checkbox', { name: 'Diffuser le travail sur tb.heig-vd.ch' });
  await expect(publication).toBeChecked();
  await expect(page.getByRole('link', { name: 'tb.heig-vd.ch', exact: true })).toHaveAttribute(
    'href',
    'https://tb.heig-vd.ch',
  );
  await page.getByRole('checkbox', { name: 'Travail confidentiel' }).check();
  await expect(publication).toBeDisabled();
  await expect(publication).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Travail confidentiel' }).uncheck();
  await expect(publication).toBeEnabled();
  await expect(publication).toBeChecked();
  await publication.uncheck();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF étudiant·e', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('etudiant.pdf');
  await download.saveAs('test-results/evaluation-etudiant.pdf');
  await page.getByRole('button', { name: 'Grille d’évaluation', exact: true }).click();
  const fullPdf = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Générer le PDF', exact: true }).click();
  await (await fullPdf).saveAs('test-results/evaluation-complete.pdf');
  await page.getByRole('button', { name: 'Verrouiller l’évaluation', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer le verrouillage', exact: true }).click();
  await expect(
    page.getByText('Cette évaluation a été verrouillée le', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByLabel(`Enseignant·e — ${criteria[0].title}`, { exact: true }),
  ).toBeDisabled();
  const finalPdf = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Générer le PDF', exact: true }).click();
  await (await finalPdf).saveAs('test-results/evaluation-finalisee.pdf');
  await page.getByRole('button', { name: 'Mes évaluations', exact: true }).click();
  await page.screenshot({ path: 'test-results/dashboard.png', fullPage: true });
  await page.reload();
  await page
    .getByRole('button', { name: 'Ouvrir l’évaluation de Camille Müller', exact: true })
    .click();
  await expect(page.getByText('Lecture seule', { exact: true })).toBeVisible();
  await expect(page.locator('.final-grade')).toContainText('5.3');
  await expect(publication).not.toBeChecked();
  await expect(publication).toBeDisabled();
  await page.getByRole('button', { name: 'Changer le thème', exact: true }).click();
  await page.screenshot({ path: 'test-results/grille-dark.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/grille-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
