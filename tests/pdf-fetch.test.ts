import { afterEach, expect, it, vi } from 'vitest';
import { fetchPdf } from '../src/api';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('récupère le PDF après un 503 de fermeture du serveur', async () => {
  vi.useFakeTimers();
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }))
    .mockResolvedValueOnce(
      new Response('%PDF-test', { headers: { 'content-type': 'application/pdf' } }),
    );
  vi.stubGlobal('fetch', request);
  const result = fetchPdf('/api/evaluations/test/pdf');
  await vi.runAllTimersAsync();
  expect(await (await result).text()).toBe('%PDF-test');
  expect(request).toHaveBeenCalledTimes(2);
});
it('limite les tentatives et fournit un message français', async () => {
  vi.useFakeTimers();
  const request = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response('Service Unavailable', { status: 503 })),
    );
  vi.stubGlobal('fetch', request);
  const result = expect(fetchPdf('/api/evaluations/test/pdf')).rejects.toThrow(
    'momentanément indisponible',
  );
  await vi.runAllTimersAsync();
  await result;
  expect(request).toHaveBeenCalledTimes(3);
});
it('ne retente pas une requête non autorisée et conserve le message', async () => {
  const request = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ error: 'Veuillez vous connecter.' }), { status: 401 }),
    );
  vi.stubGlobal('fetch', request);
  await expect(fetchPdf('/api/evaluations/test/pdf')).rejects.toThrow('Veuillez vous connecter.');
  expect(request).toHaveBeenCalledTimes(1);
});
