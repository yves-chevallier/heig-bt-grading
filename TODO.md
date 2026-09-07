L'objectif est de transformer le fichier xlsm en une app web pour l'évaluation du travail de bachelor.
Tu peux te baser sur des éléments de ~/heig-classroom pour le logo, la mise en page et le style.

L'objectif est de pouvoir ajouter une nouvelle évaluation, saisir le prénom et le nom de l'étudiant, sa filière l'enseignement responsable et l'expert, la date de la soutenance.

Quand on édite une évaluation on a quelque chose de très semblable à la grille de l'excel ou on peut ajuster la pondération globale, pas dépasser 100%, valeurs minimum indiquées.
Puis saisir les notes pour chaque critères entre 1.0 et 6.0. La note se met à jour en temps réel, arrondie au dixième près.

On a le protocole d'évaluation oral comme le troisième onglet de l'excel avec les remarques sur le déroulement. La partie 4e et 5e onglet de l'enseignant et de l'expert. Les deux notes sont automatiquement reportées dans la page d'évaluation, enfin on peut voir la grille pour l'étudiant sans pouvoir éditer car elle hérite des autres pages.

Enfin un bouton pour générer un PDF.

Pour l'authentification on fait comme heig-classroom avec un openid mais on autorise le log local pour l'admin qui peut faire comme un utilisateur. L'utilisateur peut consulter ses évaluations et à la fin vérouiller son évaluation.

