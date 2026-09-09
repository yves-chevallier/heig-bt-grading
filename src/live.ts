import { useEffect, useRef } from 'react';

/**
 * Abonnement au flux SSE des changements (server/events.ts). L'événement ne
 * porte aucune donnée : il indique seulement qu'il faut recharger, et le
 * rechargement passe par les routes autorisées habituelles.
 *
 * EventSource se reconnecte tout seul ; on recharge aussi à l'ouverture, ce qui
 * rattrape ce qui a changé pendant une coupure. Le retour au premier plan
 * déclenche également un rechargement, pour les navigateurs qui suspendent les
 * connexions d'un onglet en arrière-plan.
 */
export function useLiveUpdates(enabled: boolean, refresh: () => void) {
  // Garde la dernière closure sans réabonner à chaque rendu.
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource('/api/events');
    source.onmessage = () => latest.current();
    source.onopen = () => latest.current();
    const onFocus = () => latest.current();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      source.close();
    };
  }, [enabled]);
}
