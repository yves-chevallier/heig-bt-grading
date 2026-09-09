import type { FastifyReply } from 'fastify';

/**
 * Diffusion des changements d'évaluation par SSE, sur le modèle de
 * heig-classroom : l'événement ne transporte aucune donnée, c'est une simple
 * invitation à recharger. Le client refait alors sa requête par les routes
 * autorisées habituelles, donc rien n'est diffusé à quelqu'un qui n'y aurait
 * pas déjà accès, et une reconnexion se contente de recharger — pas de rejeu.
 *
 * Les abonnements sont regroupés par propriétaire de l'évaluation : seule la
 * personne concernée est réveillée, y compris lorsque l'écriture vient d'un
 * expert passant par son lien à capacité.
 */
export class EventHub {
  private clients = new Map<string, Set<FastifyReply>>();
  // Caddy et les proxys coupent une connexion inactive ; un commentaire SSE
  // périodique la maintient ouverte sans rien signifier pour le client.
  private static readonly HEARTBEAT_MS = 25_000;

  subscribe(owner: string, reply: FastifyReply) {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      // Neutralise la mise en tampon d'un proxy qui ne serait pas configuré.
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connecté\n\n');

    const set = this.clients.get(owner) ?? new Set();
    set.add(reply);
    this.clients.set(owner, set);

    const beat = setInterval(() => {
      try {
        reply.raw.write(': battement\n\n');
      } catch {
        this.drop(owner, reply);
      }
    }, EventHub.HEARTBEAT_MS);
    // Sans unref, un intervalle par client empêcherait le processus de sortir.
    beat.unref?.();

    const close = () => {
      clearInterval(beat);
      this.drop(owner, reply);
    };
    reply.raw.on('close', close);
    reply.raw.on('error', close);
  }

  publish(owner: string) {
    for (const reply of this.clients.get(owner) ?? []) {
      try {
        reply.raw.write('data: {}\n\n');
      } catch {
        this.drop(owner, reply);
      }
    }
  }

  closeAll() {
    for (const set of this.clients.values())
      for (const reply of set) {
        try {
          reply.raw.end();
        } catch {
          /* la connexion est déjà tombée */
        }
      }
    this.clients.clear();
  }

  private drop(owner: string, reply: FastifyReply) {
    const set = this.clients.get(owner);
    if (!set) return;
    set.delete(reply);
    if (set.size === 0) this.clients.delete(owner);
  }
}
