# Modèle Typst des PDF d'évaluation

`evaluation.typ` compose les cinq feuilles A4 (grille du jury, protocole oral,
grilles enseignant·e et expert·e, feuille de résultats). C'est le générateur
utilisé par le serveur : `server/pdf.ts` importe la fonction `render` du modèle
depuis un petit source passé sur l'entrée standard du binaire `typst`, avec les
données inlinées en JSON. Aucun fichier temporaire, et `--root` reste le
répertoire de l'application : le modèle ne peut lire que le logo
(`assets/heig-vd.svg`).

## Répartition des rôles

Aucun calcul dans le modèle. `server/pdf-data.ts` importe `shared/evaluation.ts`
et produit un objet où moyennes, arrondis, mention et totaux sont déjà résolus :
le Typst ne fait que mettre en page. Les règles de notation restent donc à un
seul endroit, celui que couvrent les tests.

`render(d, student: false)` prend cet objet ; `student: true` ne produit que la
feuille de résultats remise à l'étudiant·e, sans numérotation.

## Aperçu local

```sh
pnpm pdf:data          # exporte les données d'exemple vers typst/exemple.json
pnpm pdf:typst         # compile typst/exemple.pdf
```

`exemple.typ` appelle `render` sur `exemple.json`, que produit
`scripts/typst-data.mjs` à partir de la fixture des tests, avec des notes
insuffisantes pour montrer leur mise en évidence. Les PDF sont ignorés par git.

Pour rendre une évaluation réelle, passer par l'application ou par
`renderPdf` dans `server/pdf.ts`.

## Mise en page

- Le rouge HEIG-VD (`#da291c`) ne sert qu'au logo, aux notes inférieures à 4.0
  et aux félicitations du jury ; tout le reste est en gris.
- Police Lato (chiffres tabulaires), avec DejaVu Sans (`assets/fonts`) en
  repli si Lato n'est pas installée.
- Les encadrés de remarques mesurent leur contenu : s'il reste de la place, ils
  remplissent la page jusqu'aux signatures ; sinon ils prennent leur hauteur
  naturelle et se poursuivent sur la page suivante. Les feuilles du jury sont
  numérotées « Page n sur N » d'après la position réelle de la feuille de
  résultats, qui n'est pas numérotée.
- Les signatures n'apparaissent que sur la grille du jury et la feuille de
  résultats.

## Binaire et polices

Le serveur appelle `typst` dans le `PATH`, ou le chemin donné par `TYPST_BIN`.
`scripts/install-typst.sh` installe la version épinglée (somme de contrôle
vérifiée) ; le `Dockerfile` et le CI l'utilisent, et l'image de production
ajoute le paquet `fonts-lato`. Une compilation prend environ 0,4 s et 45 Mio.
