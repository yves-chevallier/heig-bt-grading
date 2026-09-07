import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import fastifyStatic from '@fastify/static';
import { readConfig } from './config';
import { createApp } from './app';
const config = readConfig();
const app = await createApp(config, { logger: true });
if (config.NODE_ENV === 'production') {
  await app.register(fastifyStatic, { root: resolve('dist'), wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/auth/'))
      return reply.code(404).send({ error: 'Page introuvable.' });
    return reply.sendFile('index.html');
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true, hmr: { server: app.server } },
    appType: 'custom',
  });
  // Close Vite's WebSocket connections before HTTP shutdown waits for them.
  app.addHook('preClose', async () => vite.close());
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/auth/'))
      return reply.code(404).send({ error: 'Page introuvable.' });
    // Let Vite own module/asset responses, then use its transformed HTML for SPA routes.
    await new Promise<void>((resolveMiddleware, reject) => {
      reply.raw.once('finish', resolveMiddleware);
      vite.middlewares(req.raw, reply.raw, (err?: unknown) =>
        err ? reject(err) : resolveMiddleware(),
      );
    });
    if (reply.raw.writableEnded) {
      reply.hijack();
      return;
    }
    const html = await vite.transformIndexHtml(
      req.url,
      await readFile(resolve('index.html'), 'utf8'),
    );
    return reply.type('text/html').send(html);
  });
}
await app.listen({ port: config.PORT, host: config.HOST });
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
