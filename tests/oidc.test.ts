import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { createApp } from '../server/app';
import { oidcCallbackPath } from '../server/oidc';
import { testConfig } from './fixtures';
describe('OpenID Authorization Code + PKCE avec fournisseur de test', () => {
  let issuer: Server, issuerUrl: string, app: Awaited<ReturnType<typeof createApp>>;
  const grants = new Map<
    string,
    { nonce: string; challenge: string; override?: Record<string, unknown> }
  >();
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
  beforeAll(async () => {
    issuer = createServer(async (req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/.well-known/openid-configuration')
        return res.end(
          JSON.stringify({
            issuer: issuerUrl,
            authorization_endpoint: `${issuerUrl}/authorize`,
            token_endpoint: `${issuerUrl}/token`,
            jwks_uri: `${issuerUrl}/jwks`,
            userinfo_endpoint: `${issuerUrl}/userinfo`,
            response_types_supported: ['code'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
            token_endpoint_auth_methods_supported: ['client_secret_basic'],
            code_challenge_methods_supported: ['S256'],
          }),
        );
      if (req.url === '/jwks') return res.end(JSON.stringify({ keys: [jwk] }));
      if (req.url === '/userinfo')
        return res.end(
          JSON.stringify({
            sub: 'subject-123',
            email: 'teacher@example.test',
            given_name: 'Alex',
            family_name: 'Martin',
          }),
        );
      if (req.url === '/token') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const form = new URLSearchParams(body),
          code = form.get('code') || '',
          grant = grants.get(code);
        grants.delete(code);
        const credentials = Buffer.from((req.headers.authorization || '').slice(6), 'base64')
          .toString()
          .split(':')
          .map((part) => decodeURIComponent(part.replace(/\+/g, ' ')));
        if (
          !grant ||
          createHash('sha256')
            .update(form.get('code_verifier') || '')
            .digest('base64url') !== grant.challenge ||
          credentials[0] !== 'test-client' ||
          credentials[1] !== 'test-secret'
        ) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'invalid_grant' }));
        }
        const now = Math.floor(Date.now() / 1000);
        const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString(
          'base64url',
        );
        const payload = Buffer.from(
          JSON.stringify({
            iss: issuerUrl,
            sub: 'subject-123',
            aud: 'test-client',
            iat: now,
            exp: now + 300,
            nonce: grant.nonce,
            ...grant.override,
          }),
        ).toString('base64url');
        const signature = sign(
          'RSA-SHA256',
          Buffer.from(`${header}.${payload}`),
          privateKey,
        ).toString('base64url');
        return res.end(
          JSON.stringify({
            access_token: 'test-access-token',
            token_type: 'Bearer',
            expires_in: 300,
            id_token: `${header}.${payload}.${signature}`,
          }),
        );
      }
      res.statusCode = 404;
      res.end('{}');
    });
    await new Promise<void>((resolve, reject) => {
      issuer.once('error', reject);
      issuer.listen(0, '127.0.0.1', resolve);
    });
    issuerUrl = `http://127.0.0.1:${(issuer.address() as { port: number }).port}`;
    app = await createApp({
      ...testConfig(),
      OIDC_ISSUER: issuerUrl,
      OIDC_CLIENT_ID: 'test-client',
      OIDC_CLIENT_SECRET: 'test-secret',
    });
  });
  afterAll(async () => {
    if (app) await app.close();
    if (issuer?.listening)
      await new Promise<void>((resolve, reject) =>
        issuer.close((error) => (error ? reject(error) : resolve())),
      );
  });
  async function begin(override?: Record<string, unknown>) {
    const response = await app.inject('/auth/login');
    expect(response.statusCode).toBe(302);
    const url = new URL(response.headers.location!);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    // Valeur littérale volontairement : c'est la redirect URI enregistrée dans
    // l'AAI Resource Registry, qu'edu-ID compare exactement. La comparer à
    // oidcCallbackPath ne prouverait rien, le test suivrait la constante.
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/app/auth/callback');
    const code = crypto.randomUUID();
    grants.set(code, {
      nonce: url.searchParams.get('nonce')!,
      challenge: url.searchParams.get('code_challenge')!,
      override,
    });
    return {
      code,
      state: url.searchParams.get('state')!,
      cookie: `oauth=${response.cookies.find((c) => c.name === 'oauth')!.value}`,
    };
  }
  it('authentifie le sujet, récupère userinfo et crée une session utilisateur', async () => {
    const flow = await begin();
    const response = await app.inject({
      url: `${oidcCallbackPath}?code=${flow.code}&state=${flow.state}`,
      headers: { cookie: flow.cookie },
    });
    expect(response.headers.location).toBe('/');
    const session = response.cookies.find((c) => c.name === 'session');
    expect(session).toBeDefined();
    const me = await app.inject({
      url: '/api/me',
      headers: { cookie: `session=${session!.value}` },
    });
    expect(me.json().user).toMatchObject({
      name: 'Alex Martin',
      email: 'teacher@example.test',
      role: 'user',
    });
    expect(JSON.stringify(me.json())).not.toContain('test-access-token');
    const replay = await app.inject({
      url: `${oidcCallbackPath}?code=${flow.code}&state=${flow.state}`,
      headers: { cookie: flow.cookie },
    });
    expect(replay.headers.location).toBe('/?authError=expired');
  });
  it('refuse un state différent', async () => {
    const flow = await begin();
    const response = await app.inject({
      url: `${oidcCallbackPath}?code=${flow.code}&state=wrong`,
      headers: { cookie: flow.cookie },
    });
    expect(response.headers.location).toBe('/?authError=failed');
    expect(response.cookies.some((c) => c.name === 'session')).toBe(false);
  });
  it.each([
    { nonce: 'wrong' },
    { aud: 'another-client' },
    { iss: 'https://wrong.test' },
    { exp: 1 },
  ])('refuse les claims invalides %j', async (override) => {
    const flow = await begin(override);
    const response = await app.inject({
      url: `${oidcCallbackPath}?code=${flow.code}&state=${flow.state}`,
      headers: { cookie: flow.cookie },
    });
    expect(response.headers.location).toBe('/?authError=failed');
    expect(response.cookies.some((c) => c.name === 'session')).toBe(false);
  });
});
