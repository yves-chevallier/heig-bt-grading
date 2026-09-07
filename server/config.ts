import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PUBLIC_URL: z.url().default('http://localhost:3000'),
  DATABASE_PATH: z.string().default('./data/evaluations.sqlite'),
  ADMIN_EMAIL: z.string().default('admin@localhost'),
  ADMIN_PASSWORD_HASH: z.string().default(''),
  OIDC_ISSUER: z.string().default(''),
  OIDC_CLIENT_ID: z.string().default(''),
  OIDC_CLIENT_SECRET: z.string().default(''),
  OIDC_PRIVATE_KEY_PATH: z.string().default(''),
  OIDC_PRIVATE_KEY_KID: z.string().default(''),
});
export type Config = z.infer<typeof schema>;
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = schema.parse(env);
  if (new URL(config.PUBLIC_URL).pathname !== '/')
    throw new Error('PUBLIC_URL doit être une origine sans chemin.');
  if (config.NODE_ENV === 'production' && !config.PUBLIC_URL.startsWith('https://'))
    throw new Error('PUBLIC_URL doit utiliser HTTPS en production.');
  if (
    config.ADMIN_PASSWORD_HASH &&
    !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(config.ADMIN_PASSWORD_HASH)
  )
    throw new Error('ADMIN_PASSWORD_HASH invalide. Utilisez npm run admin:password.');
  if (
    config.OIDC_ISSUER &&
    (!config.OIDC_CLIENT_ID || (!config.OIDC_CLIENT_SECRET && !config.OIDC_PRIVATE_KEY_PATH))
  )
    throw new Error('Complétez la configuration du client OpenID.');
  if (!config.ADMIN_PASSWORD_HASH && !config.OIDC_ISSUER)
    throw new Error('Configurez ADMIN_PASSWORD_HASH ou OpenID dans .env. Voir README.md.');
  return config;
}
