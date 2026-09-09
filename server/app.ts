import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { Config } from './config';
import { Store } from './store';
import { OidcProvider, oidcCallbackPath } from './oidc';
import {
  evaluationSchema,
  lockingIssues,
  programCode,
  type EvaluationRecord,
  type User,
} from '../shared/evaluation';
import { expertInput, expertInputSchema, type ExpertEvaluation } from '../shared/expert';
import { renderPdf } from './pdf';
import { EventHub } from './events';

// Routes servies par le serveur, par opposition aux routes de navigation de la
// SPA : jamais mises en cache, et 404 JSON plutôt que repli sur index.html.
// Le callback OIDC en fait partie sans être sous /auth/ (voir oidc.ts).
export const isServerRoute = (url: string) =>
  url.startsWith('/api/') || url.startsWith('/auth/') || url.startsWith(oidcCallbackPath);
const scrypt = promisify(scryptCallback);
const expertRevision = (record: EvaluationRecord) =>
  createHash('sha256')
    .update(JSON.stringify(expertInput(record.data)))
    .digest('hex');
function expertView(record: EvaluationRecord): ExpertEvaluation {
  const d = record.data;
  return {
    identity: {
      firstName: d.firstName,
      lastName: d.lastName,
      title: d.title,
      program: programCode(d.program),
      orientation: d.orientation,
      teacher: d.teacher,
      expert: d.expert,
      defenseDate: d.defenseDate,
      room: d.room,
    },
    data: expertInput(d),
    revision: expertRevision(record),
    lockedAt: record.lockedAt,
  };
}
declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}
export async function createApp(
  config: Config,
  options: { store?: Store; oidc?: OidcProvider; logger?: boolean } = {},
) {
  const store = options.store ?? new Store(config.DATABASE_PATH);
  const provider = options.oidc ?? new OidcProvider(config);
  // Do not log callback URLs (authorization codes) or credentials.
  const app = Fastify({
    logger: options.logger ?? false,
    disableRequestLogging: true,
    bodyLimit: 512_000,
  });
  const publicUrl = new URL(config.PUBLIC_URL);
  const allowedOrigins = new Set([publicUrl.origin]);
  const loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];
  // Local browser access can use any loopback spelling. Keep the configured
  // protocol and port, and retain the exact public origin in production.
  if (config.NODE_ENV !== 'production' && loopbackHosts.includes(publicUrl.hostname)) {
    for (const hostname of loopbackHosts) {
      const localUrl = new URL(publicUrl);
      localUrl.hostname = hostname;
      allowedOrigins.add(localUrl.origin);
    }
  }
  const secure = config.PUBLIC_URL.startsWith('https://');
  const cookieOptions = { path: '/', httpOnly: true, secure, sameSite: 'lax' as const };
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req, reply) => {
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Frame-Options', 'DENY');
    if (secure) reply.header('Strict-Transport-Security', 'max-age=31536000');
    if (isServerRoute(req.url)) reply.header('Cache-Control', 'no-store');
    if (config.NODE_ENV === 'production')
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (
        !allowedOrigins.has(req.headers.origin ?? '') ||
        req.headers['x-requested-with'] !== 'evaluation-tb'
      ) {
        return reply.code(403).send({ error: 'Origine de la requête refusée.' });
      }
    }
    req.user = store.session(req.cookies.session);
    if (
      req.url.startsWith('/api/') &&
      !['/api/me', '/api/expert/evaluation'].includes(req.url.split('?')[0]) &&
      !req.user
    )
      return reply.code(401).send({ error: 'Veuillez vous connecter.' });
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof z.ZodError)
      return reply
        .code(400)
        .send({ error: error.issues.map((i) => i.message).join(' '), issues: error.issues });
    const err = error as Error & { statusCode?: number };
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (status >= 500) req.log.error({ message: err.message, type: err.name }, 'Request failed');
    return reply.code(status).send({
      error:
        status === 429
          ? 'Trop de tentatives. Réessayez dans une minute.'
          : status >= 500
            ? 'Une erreur est survenue. Veuillez réessayer.'
            : err.message,
    });
  });
  const events = new EventHub();
  app.addHook('onClose', async () => events.closeAll());
  // Flux SSE des changements. La garde d'authentification ci-dessus s'applique
  // (la route est sous /api/ et n'est pas exemptée), donc on a déjà req.user.
  app.get('/api/events', async (req, reply) => {
    reply.hijack();
    events.subscribe(req.user!.id, reply);
  });
  app.get('/healthz', async () => ({ ok: true }));
  app.get('/api/me', async (req) => ({
    user: req.user,
    auth: { local: !!config.ADMIN_PASSWORD_HASH, oidc: !!config.OIDC_ISSUER },
  }));
  app.post(
    '/auth/local',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = z
        .object({ email: z.string().max(300), password: z.string().max(1024) })
        .parse(req.body);
      const [, salt, expected] = config.ADMIN_PASSWORD_HASH.split('$');
      const candidate = (await scrypt(
        body.password,
        salt || '00000000000000000000000000000000',
        64,
      )) as Buffer;
      const valid = timingSafeEqual(candidate, Buffer.from(expected || '0'.repeat(128), 'hex'));
      if (
        !config.ADMIN_PASSWORD_HASH ||
        !valid ||
        body.email.trim().toLowerCase() !== config.ADMIN_EMAIL.toLowerCase()
      )
        return reply.code(401).send({ error: 'Identifiants incorrects.' });
      const user = store.upsertUser('local:admin', 'Administrateur', config.ADMIN_EMAIL, 'admin');
      store.logout(req.cookies.session);
      reply.setCookie('session', store.newSession(user), { ...cookieOptions, maxAge: 43200 });
      return { user };
    },
  );
  app.post('/auth/logout', async (req, reply) => {
    store.logout(req.cookies.session);
    reply.clearCookie('session', cookieOptions);
    return { ok: true };
  });
  app.get('/auth/login', async (req, reply) => {
    if (!config.OIDC_ISSUER) return reply.code(503).send({ error: 'OpenID n’est pas configuré.' });
    try {
      const { url, ...stash } = await provider.beginLogin();
      store.consumeOAuth(req.cookies.oauth);
      reply.setCookie('oauth', store.stashOAuth(stash), { ...cookieOptions, maxAge: 600 });
      return reply.redirect(url);
    } catch {
      return reply.redirect('/?authError=unavailable');
    }
  });
  app.get(oidcCallbackPath, async (req, reply) => {
    const stash = store.consumeOAuth(req.cookies.oauth);
    reply.clearCookie('oauth', cookieOptions);
    if (!stash) return reply.redirect('/?authError=expired');
    try {
      const claims = await provider.completeLogin(new URL(req.url, config.PUBLIC_URL), stash);
      const user = store.upsertUser(claims.identity, claims.name, claims.email, 'user');
      store.logout(req.cookies.session);
      reply.setCookie('session', store.newSession(user), { ...cookieOptions, maxAge: 43200 });
      return reply.redirect('/');
    } catch {
      return reply.redirect('/?authError=failed');
    }
  });
  app.get('/api/evaluations', async (req) => ({ evaluations: store.list(req.user!.id) }));
  app.post<{ Params: { id: string } }>('/api/evaluations/:id/expert-link', async (req, reply) => {
    const existing = store.get(req.user!.id, req.params.id);
    if (!existing) return reply.code(404).send({ error: 'Évaluation introuvable.' });
    if (existing.lockedAt)
      return reply.code(423).send({ error: 'Cette évaluation est verrouillée.' });
    const token = store.expertLink(req.user!.id, req.params.id)!;
    // A fragment keeps the capability out of request URLs, referrers and access logs.
    return { url: new URL(`/expert#${token}`, publicUrl).href };
  });
  for (const method of ['GET', 'PUT'] as const) {
    app.route({
      method,
      url: '/api/expert/evaluation',
      handler: async (req, reply) => {
        const authorization = req.headers.authorization ?? '';
        const access = store.expertEvaluation(
          authorization.startsWith('Bearer ') ? authorization.slice(7) : '',
        );
        if (!access)
          return reply.code(404).send({ error: 'Lien expert invalide ou indisponible.' });
        const existing = access.evaluation;
        if (method === 'GET') return expertView(existing);
        if (existing.lockedAt)
          return reply
            .code(423)
            .send({ error: 'Cette évaluation est verrouillée. La saisie est terminée.' });
        const body = z
          .object({ revision: z.string().regex(/^[a-f0-9]{64}$/), data: expertInputSchema })
          .strict()
          .parse(req.body);
        if (body.revision !== expertRevision(existing))
          return reply.code(409).send({
            error:
              'Les notes de l’expert ont été modifiées ailleurs. Rechargez les données avant de poursuivre.',
          });
        // Merge only the expert fields into the latest record. Teacher-only edits do not conflict.
        const data = {
          ...existing.data,
          expertMarks: existing.data.expertMarks.map((value, i) =>
            i === 2 ? body.data.reportMark : i === 3 ? body.data.workMark : value,
          ),
          expertOral: body.data.expertOral,
        };
        const saved = store.update(access.owner, existing.id, existing.version, data);
        if (!saved)
          return reply
            .code(409)
            .send({ error: 'L’évaluation a changé. Rechargez les données avant de poursuivre.' });
        // C'est la propagation qui compte le plus : l'enseignant·e voit arriver
        // les notes de l'expert sans recharger sa page.
        events.publish(access.owner);
        return expertView(saved);
      },
    });
  }
  app.post('/api/evaluations', async (req, reply) => {
    const data = evaluationSchema.parse(req.body);
    const created = store.create(req.user!.id, data);
    events.publish(req.user!.id);
    return reply.code(201).send(created);
  });
  app.get<{ Params: { id: string } }>('/api/evaluations/:id', async (req, reply) => {
    const evaluation = store.get(req.user!.id, req.params.id);
    return evaluation ?? reply.code(404).send({ error: 'Évaluation introuvable.' });
  });
  for (const lock of [false, true]) {
    app.route<{ Params: { id: string } }>({
      method: lock ? 'POST' : 'PUT',
      url: `/api/evaluations/:id${lock ? '/lock' : ''}`,
      handler: async (req, reply) => {
        const existing = store.get(req.user!.id, req.params.id);
        if (!existing) return reply.code(404).send({ error: 'Évaluation introuvable.' });
        if (existing.lockedAt)
          return reply
            .code(423)
            .send({ error: 'Cette évaluation est verrouillée et ne peut plus être modifiée.' });
        const body = z
          .object({ version: z.number().int().positive(), data: evaluationSchema })
          .strict()
          .parse(req.body);
        if (lock) {
          const issues = lockingIssues(body.data);
          if (issues.length) return reply.code(400).send({ error: issues.join(' ') });
        }
        const updated = store.update(req.user!.id, req.params.id, body.version, body.data, lock);
        if (!updated)
          return reply.code(409).send({
            error:
              'Cette évaluation a été modifiée dans une autre fenêtre. Rechargez-la avant de poursuivre.',
          });
        // Réveille les autres onglets de la même personne, et la liste des
        // évaluations ouverte à côté de l'éditeur.
        events.publish(req.user!.id);
        return updated;
      },
    });
  }
  app.get<{ Params: { id: string }; Querystring: { view?: string } }>(
    '/api/evaluations/:id/pdf',
    async (req, reply) => {
      const evaluation = store.get(req.user!.id, req.params.id);
      if (!evaluation) return reply.code(404).send({ error: 'Évaluation introuvable.' });
      const student = req.query.view === 'student';
      let pdf: Buffer;
      try {
        pdf = await renderPdf(evaluation, student);
      } catch (err) {
        req.log.error(err, 'génération du PDF');
        return reply.code(500).send({ error: 'La génération du PDF a échoué.' });
      }
      const filename =
        `evaluation-${evaluation.data.lastName}-${evaluation.data.firstName}${student ? '-etudiant' : ''}.pdf`
          .normalize('NFD')
          .replace(/[^a-zA-Z0-9._-]/g, '-');
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(pdf);
    },
  );
  app.addHook('onClose', async () => store.db.close());
  return app;
}
