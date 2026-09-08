# Modèle Typst des PDF d'évaluation

Essai de remplacement du générateur PDFKit (`server/pdf.ts`) par un modèle
Typst. **Local uniquement pour l'instant** : rien n'est branché sur le serveur,
qui continue de produire les PDF avec PDFKit.

## Rendre

```sh
pnpm pdf:data          # exporte les données d'exemple vers typst/exemple.json
pnpm pdf:typst         # compile typst/evaluation.pdf
```

Ou directement, si `typst` est dans le `PATH` :

```sh
typst compile --root . typst/evaluation.typ typst/evaluation.pdf
```

`--root .` est nécessaire : le modèle lit `assets/heig-vd.svg`, hors de son
propre répertoire.

## Répartition des rôles

Aucun calcul dans le modèle. `scripts/typst-data.mjs` importe `shared/evaluation.ts`
et produit un JSON où moyennes, arrondis, mention et totaux sont déjà résolus :
le Typst ne fait que mettre en page. Les règles de notation restent donc à un
seul endroit, celui que couvrent les tests.

Pour rendre une évaluation réelle plutôt que l'exemple, importer `typstData`
depuis `scripts/typst-data.mjs` et lui passer un `EvaluationRecord`.

## Écarts assumés avec la version PDFKit

Même disposition d'ensemble — logo en haut à gauche, titre à droite, bandeau
d'identité, grille, décisions et échelle, remarques, signatures, pied de page —
avec quelques différences délibérées :

- **Le logo garde le rouge HEIG-VD** (`#da291c`). La version PDFKit extrait les
  tracés du SVG et les remplit en noir, ce qui perd la couleur de marque.
- **Le rouge ne sert qu'à trois choses** : le filet sous le titre, la note
  finale, les décisions cochées. Tout le reste reste en gris.
- **Police Lato** au lieu de DejaVu Sans. Voir la réserve ci-dessous.
- Filets allégés, intitulés de colonnes en petites capitales espacées,
  chiffres tabulaires pour que les notes s'alignent en colonne.
- L'encadré de remarques s'étire jusqu'aux signatures au lieu d'avoir une
  hauteur fixe suivie d'un vide.

## Réserve avant de brancher ça sur le serveur

Lato vient de la machine locale et **n'est pas dans l'image Docker**, qui
n'embarque que `assets/fonts/DejaVuSans*.ttf`. Trois options : ajouter les
fichiers Lato au dépôt (licence SIL OFL, redistribuable), installer le paquet
système dans le `Dockerfile`, ou revenir à DejaVu Sans. Le modèle a déjà
DejaVu Sans en police de repli, donc il compile sans Lato — mais le rendu perd
en finesse.

Il faudra aussi un binaire `typst` dans l'image, ou la bibliothèque via WASM.
