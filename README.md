# HEIG Évaluation TB

Application web francophone pour évaluer les travaux de bachelor. Elle reprend les critères du fichier `Evaluation TB Grilles et protocole.xlsm`, avec une interface inspirée de `~/heig-classroom` : accent rouge HEIG, logo au mortier, cartes et thèmes clair/sombre.

## Démarrage local

Prérequis : Node.js **22.13 ou plus récent** et pnpm **10.34.4**. La base utilise SQLite intégré à Node.js ; aucun serveur de base de données n’est nécessaire.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm admin:password
```

La dernière commande demande un mot de passe masqué d’au moins 12 caractères. Copier la ligne `ADMIN_PASSWORD_HASH='…'` obtenue dans `.env` et choisir `ADMIN_EMAIL`. Conserver les apostrophes autour du hash. Aucun compte à mot de passe par défaut n’est créé.

```sh
pnpm dev
```

Ouvrir **http://localhost:3000** ou **http://127.0.0.1:3000** et utiliser l’accès administrateur local. En développement, lorsque `PUBLIC_URL` est une adresse de boucle locale, le contrôle d’origine accepte `localhost`, `127.0.0.1` et `[::1]` avec le même protocole et le même port. En production, seule l’origine exacte de `PUBLIC_URL` est acceptée. L’administrateur crée et évalue ses propres dossiers comme un utilisateur OpenID. Il ne peut pas contourner le verrouillage ni consulter les dossiers des autres utilisateurs.

## Utilisation

1. **Nouvelle évaluation** : prénom, nom, filière, enseignant·e, expert·e, titre du TB et date de soutenance. Orientation et salle facultatives. Les listes de filières/orientations sont proposées ; une autre valeur peut être saisie. Génie Électrique utilise le code GE. Les anciens codes ELCI sont affichés en GE et normalisés au prochain enregistrement, sans migration de la base.
2. **Grille d’évaluation** : répartir la pondération. Les critères 1 (revue de projet) et 2 (déroulement et apport personnel) sont notés uniquement par l’enseignant·e. Les critères 3 et 4 sont notés par l’enseignant·e et l’expert·e. Le cinquième hérite des notes orales.
3. **Soutenance** : observations sur le déroulement, appréciation de la présentation, questions et réponses, synthèse globale du jury.
4. **Oral · Enseignant·e / Expert·e** : points et observations pour les douze critères, sans blocs de commentaires globaux intermédiaires.
5. **Décisions du jury** : cocher « Diffuser le travail sur tb.heig-vd.ch » pour autoriser la diffusion. La case est désactivée pour les travaux confidentiels.
6. **Enregistrer** sauvegarde le dossier. Le changement d’onglet conserve la saisie ; la sortie prévient des modifications non enregistrées. Le PDF enregistre d’abord les modifications.
7. **Verrouiller** exige une pondération à 100 %, toutes les notes et les trois appréciations du protocole. Après confirmation, le dossier est définitivement en lecture seule.

Le bouton **Générer le PDF** télécharge les cinq feuilles A4 : grille principale, protocole, deux évaluations orales et grille étudiant. La première page réunit les notes, les cases de décision, l’échelle d’évaluation, la diffusion, les remarques et les signatures. Le logo HEIG-VD reste vectoriel, placé à 1,5 cm des bords supérieur et gauche ; toutes les pages ont des marges de 1,5 cm sur les quatre côtés. Les textes trop longs sont conservés intégralement dans des annexes numérotées, avec un renvoi sur la feuille concernée. Le bouton **PDF étudiant·e**, disponible en haut de l’évaluation, exporte la feuille indépendante « Travail de Bachelor » et ses éventuelles annexes. Cette feuille ne présente ni décisions du jury, ni diffusion, ni numéro de page ; seules les félicitations apparaissent lorsqu’elles sont accordées. Elle est également jointe au dossier complet, en dehors de sa pagination. Les brouillons portent la mention « Brouillon » ; les documents verrouillés portent la date et la version. Le verrouillage n’est pas une signature électronique.

## Règles de calcul et correspondance Excel

| Critère du classeur                     | Minimum |
| --------------------------------------- | ------: |
| Revue de projet / rapport intermédiaire |    10 % |
| Déroulement et apport personnel         |    15 % |
| Rapport final et documentation          |    15 % |
| Qualité de travail                      |    20 % |
| Soutenance                              |    15 % |

Les nouvelles évaluations reprennent les **75 % de minimums du classeur**. Il reste 25 % à répartir. Les pondérations sont des pourcentages entiers ; le total ne peut jamais dépasser 100 %. Les contrôles sont appliqués dans l’interface et côté serveur.

- Notes de la grille : **1.0 à 6.0**, au dixième. Virgule ou point acceptés à la saisie. Une case vide est une note manquante.
- Oral : **20 points d’expression + 30 points de maîtrise du sujet + 10 points de présence**. Chaque critère respecte son plafond de 4 ou 5 points. Note reportée = total / 10, arrondie au dixième. Les deux grilles doivent être entièrement renseignées pour calculer leurs notes.
- Note finale par critère : note de l’enseignant·e seul·e pour les critères 1 et 2 ; moyenne des deux membres du jury pour les critères 3, 4 et 5, arrondie au dixième. Ces notes finales affichées sont celles utilisées dans la pondération. Huit notes sont nécessaires au total (cinq enseignant·e, trois expert·e).
- Note finale : somme des notes finales affichées × pondération / 100, arrondie au dixième le plus proche. Elle reste vide tant qu’une note manque ou que le total n’est pas 100 %. Exemple : `4.5×10 % + 5.0×20 % + 5.0×15 % + 5.3×30 % + 4.7×25 % = 4.965`, soit **5.0**. Le résultat avant l’arrondi final est visible dans le récapitulatif et les PDF. Le calcul utilise des dixièmes et pourcentages entiers pour éviter les imprécisions binaires aux seuils d’arrondi.
- Diffusion : règle du classeur (note ≥ 5 et travail non confidentiel), avec décision explicite du jury possible. Un travail confidentiel n’est jamais indiqué comme diffusable. Cette décision est enregistrée ; l’application ne publie aucun document sur tb.heig-vd.ch.

Le classeur calcule une valeur globale au centième et laisse la note définitive manuscrite ; l’application automatise la note définitive au dixième conformément à la demande. Elle ne reprend pas le `1` de substitution de l’Excel pour les cases vides, ni ses références cassées. Les macros ne sont pas exécutées. Le calcul oral total / 10 correspond à la conversion du barème sur 60 vers la note sur 6.

Les données de référence sont dans `shared/rubric.json`. Pour les extraire à nouveau du classeur original, sans dépendance Python :

```sh
python3 scripts/extract-workbook.py
```

## OpenID Connect

Le fournisseur est découvert à la première connexion. Le flux reprend celui de `heig-classroom` : Authorization Code, PKCE S256, `state`, `nonce`, contrôle des claims par `openid-client` et repli vers `userinfo` lorsque l’adresse e-mail n’est pas dans l’ID token. Les jetons du fournisseur ne sont pas conservés. Références : [authorizationCodeGrant](https://github.com/panva/openid-client/blob/main/docs/functions/authorizationCodeGrant.md), [PrivateKeyJwt](https://github.com/panva/openid-client/blob/main/docs/functions/PrivateKeyJwt.md).

Enregistrer un client dédié auprès du fournisseur et autoriser exactement cette URI de retour :

```text
https://votre-domaine/auth/callback
```

Configurer `.env` :

```dotenv
PUBLIC_URL=https://votre-domaine
OIDC_ISSUER=https://votre-fournisseur
OIDC_CLIENT_ID=identifiant-du-client
OIDC_CLIENT_SECRET=secret-du-client
```

Pour SWITCH edu-ID avec `private_key_jwt`, utiliser `OIDC_PRIVATE_KEY_PATH` (clé privée EC P-256 au format PEM) et `OIDC_PRIVATE_KEY_KID`, à la place du secret, comme dans `heig-classroom`. En conteneur, monter le fichier de clé en lecture seule et utiliser son chemin interne. Aucun secret de `heig-classroom` n’a été copié.

Les utilisateurs sont identifiés par le couple **issuer + sub**, jamais fusionnés avec l’administrateur par adresse e-mail. Tout compte accepté par le client OpenID peut utiliser l’application ; les restrictions institutionnelles doivent être configurées sur ce client chez le fournisseur.

`ADMIN_PASSWORD_HASH` peut rester configuré en parallèle d’OpenID pour conserver l’accès local de l’administrateur. Les mots de passe sont dérivés avec scrypt. Sessions serveur persistantes de 12 heures, cookie HTTP-only/SameSite=Lax/Secure en HTTPS, protection d’origine des écritures et limitation des tentatives locales. Une déconnexion révoque la session de l’application.

## Production et conservation

```sh
pnpm build
pnpm start
```

En production, `PUBLIC_URL` doit être en HTTPS. Placer l’application derrière un reverse proxy HTTPS. Par défaut, elle écoute uniquement sur `127.0.0.1:3000`. Le proxy doit transmettre le chemin et le header `Origin` sans les réécrire. `HOST=0.0.0.0` permet une écoute dans un conteneur.

Un `Dockerfile` et `compose.yml` sont fournis : après configuration du `.env` de production, lancer `docker compose up -d --build`. Le port du conteneur est exposé sur la boucle locale, pour le reverse proxy. Le volume `evaluations` conserve la base ; ne pas utiliser `docker compose down -v` si les dossiers doivent être conservés. Le conteneur s’exécute sans privilèges root.

SQLite conserve utilisateurs, sessions, états OpenID temporaires et dossiers dans `data/evaluations.sqlite` (paramètre `DATABASE_PATH`). Prévoir des sauvegardes de ce volume. Arrêter l’application avant une copie de fichiers, ou utiliser l’API de sauvegarde SQLite pour une copie cohérente à chaud. SQLite utilise le mode WAL : une copie à chaud du seul fichier principal ne suffit pas. Cette version est prévue pour une instance de serveur, sur un volume local persistant.

Les écritures utilisent un numéro de version pour éviter qu’un deuxième onglet écrase une modification. Le verrouillage est protégé par l’API et par des triggers SQLite ; aucun déverrouillage n’est exposé.

## Vérifications

Les tests de mise en page PDF utilisent `pdftotext` (paquet système `poppler-utils` sur Debian/Ubuntu). Cet outil n’est pas nécessaire pour servir l’application ni générer les PDF.

```sh
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

Les tests couvrent les calculs et les limites, les permissions, les sessions, les conflits de version, l’irréversibilité du verrouillage et les PDF. OpenID est exercé contre un fournisseur local de test, avec échange de code, PKCE, userinfo et refus de claims invalides. Le parcours navigateur crée une évaluation, saisit les notes, complète le protocole, télécharge les PDF, verrouille, recharge et vérifie la vue mobile. Il utilise une base en mémoire et des identifiants de test isolés. Les captures et PDF de vérification sont dans `test-results/`.

Le raccordement au véritable fournisseur institutionnel doit être validé avec les paramètres du client dédié. Aucun déploiement ni connexion au fournisseur réel n’est effectué par les tests.

## Structure

- `shared/` : grille extraite, schémas de validation et calculs communs au navigateur et au serveur.
- `src/` : interface React et styles.
- `server/` : API Fastify, authentification, SQLite et génération PDF.
- `tests/` : tests unitaires, API, fournisseur OpenID local et parcours Playwright.
- `assets/fonts/` : polices DejaVu embarquées pour les caractères français dans les PDF ; licence jointe.

Les dossiers existants restent compatibles : les anciennes notes expert des critères 1 et 2 et les anciens commentaires globaux oraux sont conservés dans les données, mais ne sont plus affichés ni utilisés dans les calculs ou les PDF. Aucune migration ni réinitialisation de la base n’est nécessaire.
