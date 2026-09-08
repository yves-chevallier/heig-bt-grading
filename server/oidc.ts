// Same Authorization Code + PKCE / state / nonce flow as heig-classroom.
import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as oidc from 'openid-client';
import type { Config } from './config';
// Chemin du callback OIDC. Il est imposé par l'AAI Resource Registry, qui a
// enregistré la redirect URI sous /app/ (convention héritée de
// heig-classroom) : edu-ID compare la valeur exacte et refuse tout autre
// chemin par « InvalidRedirectionURI ». Les autres routes d'authentification
// restent sous /auth/, d'où les préfixes doubles côté serveur.
export const oidcCallbackPath = '/app/auth/callback';
export class OidcProvider {
  private config: oidc.Configuration | null = null;
  constructor(private app: Config) {}
  private async configuration() {
    if (this.config) return this.config;
    const execute = this.app.NODE_ENV === 'production' ? [] : [oidc.allowInsecureRequests];
    let auth: oidc.ClientAuth;
    if (this.app.OIDC_PRIVATE_KEY_PATH) {
      const der = createPrivateKey(readFileSync(this.app.OIDC_PRIVATE_KEY_PATH)).export({
        type: 'pkcs8',
        format: 'der',
      });
      const key = await crypto.subtle.importKey(
        'pkcs8',
        der,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
      );
      auth = oidc.PrivateKeyJwt({ key, kid: this.app.OIDC_PRIVATE_KEY_KID || undefined });
    } else auth = oidc.ClientSecretBasic(this.app.OIDC_CLIENT_SECRET);
    this.config = await oidc.discovery(
      new URL(this.app.OIDC_ISSUER),
      this.app.OIDC_CLIENT_ID,
      undefined,
      auth,
      { execute },
    );
    return this.config;
  }
  async beginLogin() {
    const config = await this.configuration();
    const codeVerifier = oidc.randomPKCECodeVerifier(),
      state = oidc.randomState(),
      nonce = oidc.randomNonce();
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: new URL(oidcCallbackPath, this.app.PUBLIC_URL).href,
      scope: 'openid profile email',
      code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    return { url: url.href, codeVerifier, state, nonce };
  }
  async completeLogin(url: URL, stash: { codeVerifier: string; state: string; nonce: string }) {
    const config = await this.configuration();
    const tokens = await oidc.authorizationCodeGrant(config, url, {
      pkceCodeVerifier: stash.codeVerifier,
      expectedState: stash.state,
      expectedNonce: stash.nonce,
    });
    const id = tokens.claims();
    if (!id) throw new Error('ID token absent');
    let claims: Record<string, unknown> = id;
    if (typeof claims.email !== 'string')
      claims = { ...id, ...(await oidc.fetchUserInfo(config, tokens.access_token, id.sub)) };
    if (typeof claims.email !== 'string' || !claims.email.trim())
      throw new Error('Claim email absente');
    const name =
      [claims.given_name, claims.family_name].filter((v) => typeof v === 'string').join(' ') ||
      claims.email;
    return {
      identity: JSON.stringify([this.app.OIDC_ISSUER, id.sub]),
      name,
      email: claims.email.trim().toLowerCase(),
    };
  }
}
