import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { CircleHelp, X } from 'lucide-react';

/**
 * Aide contextuelle, reprise de heig-classroom : de petits « ? » posés sur les
 * éléments qui le méritent ouvrent un tiroir à droite décrivant l'élément. Le
 * tiroir reste caché tant qu'on ne l'appelle pas, et se referme au premier clic
 * à l'extérieur ou sur Échap.
 *
 * Le contenu vit ici plutôt que dans des fichiers Markdown : l'application est
 * unilingue et n'embarque pas de moteur de rendu Markdown, qu'il aurait fallu
 * ajouter — ou bricoler — pour trois paragraphes par sujet.
 */
type Topic = { title: string; body: string[] };

export const TOPICS = {
  weights: {
    title: 'Pondération des critères',
    body: [
      'Chaque critère porte un poids en pourcentage. Le total doit atteindre exactement 100 % pour que l’évaluation puisse être verrouillée.',
      'Chaque critère a un minimum imposé, rappelé sous son poids. Descendre en dessous est refusé à l’enregistrement.',
      'Tant que le total dépasse 100 %, rien n’est enregistré : l’indicateur en haut de page passe à « Non enregistré ».',
    ],
  },
  finalGrade: {
    title: 'Calcul de la note',
    body: [
      'Pour les critères évalués à deux, la note du critère est la moyenne de celle de l’enseignant·e et de celle de l’expert·e, arrondie au dixième.',
      'La note finale est la moyenne de ces notes pondérée par les pourcentages, arrondie au dixième. La valeur avant arrondi est affichée sous « Évaluation globale ».',
      'Le calcul se fait en dixièmes entiers, afin qu’une note pile sur un seuil ne bascule pas au hasard des arrondis binaires.',
    ],
  },
  oralGrid: {
    title: 'Grille de la soutenance',
    body: [
      'Les douze critères se répartissent en deux blocs : expression orale sur 20 points, sujet présenté sur 30 points.',
      'Dix points de présence sont acquis. La note reportée vaut donc (total des points + 10) ÷ 10.',
      'L’enseignant·e et l’expert·e remplissent chacun·e leur grille ; la note de la soutenance est la moyenne des deux.',
    ],
  },
  expertLink: {
    title: 'Lien expert',
    body: [
      'Ce lien donne accès à la seule partie de l’expert·e : ses notes et sa grille de soutenance. Le reste de l’évaluation n’est ni visible ni modifiable.',
      'Le jeton est placé après le # de l’adresse : il n’est donc jamais transmis au serveur dans l’URL, et n’apparaît ni dans les journaux ni dans les référents.',
      'Le lien reste utilisable jusqu’au verrouillage de l’évaluation. Toute personne qui l’obtient peut saisir : ne le diffusez qu’à l’expert·e.',
    ],
  },
  autosave: {
    title: 'Enregistrement automatique',
    body: [
      'Il n’y a pas de bouton « Enregistrer » : chaque modification part d’elle-même après une courte pause dans la saisie.',
      '« Non enregistré » signale que les données ne satisfont pas encore les règles — un champ obligatoire vide, une pondération au-delà de 100 %. Survolez l’indicateur pour en connaître la raison.',
      'Les modifications de l’expert·e arrivent en direct, sans recharger la page.',
    ],
  },
  locking: {
    title: 'Verrouillage',
    body: [
      'Le verrouillage clôt l’évaluation : plus aucune modification n’est possible, ni par vous ni par l’expert·e.',
      'Il exige une évaluation complète : pondération à 100 %, toutes les notes saisies et les appréciations de la soutenance renseignées.',
      'Les PDF restent générables après verrouillage.',
    ],
  },
} satisfies Record<string, Topic>;

export type TopicKey = keyof typeof TOPICS;

const HelpContext = createContext<{ open: (key: TopicKey) => void }>({ open: () => {} });

export function HelpIcon({ topic }: { topic: TopicKey }) {
  const { open } = useContext(HelpContext);
  return (
    <button
      type="button"
      className="help-icon"
      aria-label={`Aide : ${TOPICS[topic].title}`}
      title={`Aide : ${TOPICS[topic].title}`}
      onClick={(e) => {
        e.stopPropagation();
        open(topic);
      }}
    >
      <CircleHelp size={14} />
    </button>
  );
}

export function HelpProvider({ children }: { children: ReactNode }) {
  const [topic, setTopic] = useState<TopicKey | null>(null);
  useEffect(() => {
    if (!topic) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTopic(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [topic]);
  const current = topic ? TOPICS[topic] : null;
  return (
    <HelpContext.Provider value={{ open: setTopic }}>
      {children}
      {/* Voile transparent : il capte le clic extérieur. Il est au-dessus des
          fenêtres modales, pour qu'une aide ouverte depuis l'une d'elles ne
          glisse pas dessous et que la refermer ne referme pas la modale. */}
      {topic && <div className="help-backdrop" onClick={() => setTopic(null)} />}
      <aside
        className={`help-drawer${current ? ' open' : ''}`}
        role="complementary"
        aria-label="Aide"
        aria-hidden={!current}
        onClick={(e) => e.stopPropagation()}
      >
        {current && (
          <>
            <div className="help-head">
              <CircleHelp size={16} />
              <h2>{current.title}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Fermer l’aide"
                onClick={() => setTopic(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="help-body">
              {current.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </>
        )}
      </aside>
    </HelpContext.Provider>
  );
}
