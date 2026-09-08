// Modèle Typst des PDF d'évaluation de travail de bachelor.
//
// Rendu :
//   typst compile typst/evaluation.typ typst/evaluation.pdf
// Les données proviennent de scripts/typst-data.mjs, qui applique déjà tous les
// calculs (moyennes, arrondis, mention) : ce fichier ne fait que mettre en page.

#let d = json("exemple.json")

// — Palette ————————————————————————————————————————————————————————————————
// Le rouge est celui du logo HEIG-VD (#da291c). Il ne sert qu'à signaler :
// filet de titre, note finale, décisions cochées. Tout le reste est en gris.
#let brand = rgb("#da291c")
#let ink = rgb("#1a1a1a")
#let muted = rgb("#6b6b6b")
#let hair = rgb("#d9d9d9")
#let rule = rgb("#9a9a9a")
#let wash = rgb("#f6f6f6")

#let jury-pages = 4

#set document(title: "Évaluation TB — " + d.meta.student, author: "HEIG-VD · Département TIN")
#set page(
  paper: "a4",
  margin: 1.5cm,
  footer: context {
    let n = here().page()
    set text(size: 7pt, fill: muted)
    line(length: 100%, stroke: 0.4pt + hair)
    v(-3pt)
    grid(
      columns: (1fr, auto),
      align(left)[#d.meta.status · Version #d.meta.version],
      align(right)[#if n <= jury-pages [#n / #jury-pages] else [Feuille de résultats]],
    )
  },
)
#set text(font: ("Lato", "DejaVu Sans"), size: 9pt, fill: ink, lang: "fr", number-width: "tabular")
// Sans cela, chaque #text d'une cellule devient un paragraphe séparé par une
// interligne pleine, ce qui double la hauteur des lignes du tableau.
#set par(justify: false, leading: 0.55em, spacing: 0.55em)

// — Fragments ——————————————————————————————————————————————————————————————
#let label-txt(t) = text(size: 6.5pt, fill: muted, weight: 600, tracking: 0.3pt, hyphenate: false, upper(t))
#let col-label(t) = text(size: 6pt, fill: muted, weight: 600, tracking: 0.2pt, hyphenate: false, upper(t))
#let field(l, value) = block(breakable: false)[
  #label-txt(l)
  #v(1.5pt)
  #text(size: 9pt)[#value]
]

// En-tête : logo à gauche, titre à droite, filet rouge. Même position
// qu'actuellement, mais le logo garde sa couleur de marque au lieu d'être aplati
// en noir, et le filet remplace l'espace vide sous le titre.
#let head(title, tag) = {
  grid(
    columns: (auto, 1fr),
    align: (left + top, right + bottom),
    image("../assets/heig-vd.svg", height: 34pt),
    block[
      #text(size: 19pt, weight: 700, tracking: -0.3pt)[#title]
      #v(2pt)
      #text(size: 8pt, fill: muted)[Département TIN · #tag]
    ],
  )
  v(5pt)
  line(length: 100%, stroke: 1.2pt + brand)
  v(9pt)
}

// Bandeau d'identité, repris sur chaque feuille.
#let identity() = {
  field("Titre du travail de bachelor", text(size: 12pt, weight: 700)[#d.meta.title])
  v(7pt)
  grid(
    columns: (1fr, 1fr, 1fr),
    gutter: 10pt,
    field("Étudiant·e", text(size: 11pt, weight: 700)[#d.meta.student]),
    field("Filière / orientation", if d.meta.orientation == "" { d.meta.program } else {
      d.meta.program + " · " + d.meta.orientation
    }),
    field("Soutenance / salle", d.meta.defense + if d.meta.room != "" { " · " + d.meta.room } else { "" }),
  )
  v(6pt)
  grid(
    columns: (1fr, 1fr, 1fr),
    gutter: 10pt,
    field("Enseignant·e responsable", d.meta.teacher),
    field("Expert·e", d.meta.expert),
    [],
  )
  v(11pt)
}

#let sheet(title, tag, body) = {
  head(title, tag)
  identity()
  body
}

#let signatures(push: true) = {
  if push { v(1fr) }
  grid(
    columns: (1fr, 1fr),
    gutter: 24pt,
    ..([Signature de l’enseignant·e responsable], [Signature de l’expert·e]).map(l => block[
      #v(22pt)
      #line(length: 100%, stroke: 0.5pt + rule)
      #v(2pt)
      #label-txt(l)
    ]),
  )
}

#let tick(on) = box(
  width: 8pt, height: 8pt, radius: 1pt, baseline: 1pt,
  stroke: 0.6pt + if on { brand } else { rule },
  fill: if on { brand } else { white },
)[#if on [
  #set align(center + horizon)
  #text(size: 6.5pt, fill: white, weight: 700)[✓]
]]

// — Grille des critères ————————————————————————————————————————————————————
// `jury` distingue la grille du jury (colonnes enseignant·e et expert·e) de la
// feuille remise à l'étudiant·e, qui n'en montre que la synthèse.
#let criteria-table(jury) = {
  // Largeurs tenant aussi avec la police de repli DejaVu Sans, plus large que
    // Lato : sinon « Pondération » et « Enseignant·e » se touchent.
    let cols = if jury { (1fr, 58pt, 62pt, 52pt, 64pt) } else { (1fr, 62pt, 62pt) }
  let head-cells = if jury {
    ("Critères d’évaluation", "Pondération", "Enseignant·e", "Expert·e", "Note finale")
  } else { ("Critères d’évaluation", "Pondération", "Note finale") }

  table(
    columns: cols,
    stroke: none,
    inset: (x: 8pt, y: 7pt),
    align: (left, center, center, center, center),
    table.header(
      ..head-cells.enumerate().map(((i, c)) => table.cell(
        fill: wash,
        align: if i == 0 { left } else { center },
      )[#label-txt(c)]),
    ),
    table.hline(stroke: 0.6pt + rule),

    ..d.criteria.map(c => {
      let cells = (
        table.cell[
          #if c.phase != "" [#text(size: 6.5pt, fill: muted)[#c.phase] #v(2pt)]
          #text(size: 8.5pt, weight: 700)[#c.number. #c.title]
          #v(1.5pt)
          #text(size: 7.5pt, fill: muted)[#c.description]
        ],
        table.cell[
          #text(size: 10pt, weight: 700)[#c.weight #h(1.5pt)%]
          #v(1pt)
          #text(size: 6.5pt, fill: muted)[min. #c.minimum #h(1.5pt)%]
        ],
      )
      let grades = if jury {
        (
          table.cell[#text(size: 10pt)[#c.teacher]],
          table.cell[#text(size: 10pt)[#c.expert]],
          table.cell[#text(size: 11pt, weight: 700)[#c.final]],
        )
      } else { (table.cell[#text(size: 11pt, weight: 700)[#c.final]],) }
      (..cells, ..grades, table.hline(stroke: 0.4pt + hair))
    }).flatten(),

    // Ligne de synthèse : la seule valeur mise en couleur de toute la page.
    table.cell(fill: wash)[
      #text(size: 10.5pt, weight: 700)[Évaluation globale]
      #v(1.5pt)
      #text(size: 7pt, fill: muted)[Avant arrondi final : #d.overall.beforeRounding · #d.overall.mention]
    ],
    table.cell(fill: wash)[#text(size: 10pt, weight: 700)[#d.overall.weight #h(1.5pt)%]],
    ..if jury { (table.cell(fill: wash)[], table.cell(fill: wash)[]) } else { () },
    table.cell(fill: wash)[#text(size: 17pt, weight: 700, fill: brand)[#d.overall.final]],
    table.hline(stroke: 0.6pt + rule),
  )
}

#let scale-block(wide) = {
  label-txt("Échelle d’évaluation")
  v(4pt)
  let cell(s) = block(
    width: 100%,
    inset: (x: 4pt, y: 3pt),
    radius: 1pt,
    fill: if s.active { wash } else { white },
  )[
    #grid(
      columns: (auto, 1fr),
      gutter: 6pt,
      text(size: 7pt, weight: if s.active { 700 } else { 400 })[#s.range],
      text(size: 7pt, fill: if s.active { ink } else { muted })[
        #text(weight: 700)[#s.code] · #s.label
      ],
    )
  ]
  if wide {
    grid(columns: (1fr,) * 4, gutter: 3pt, ..d.scale.map(cell))
  } else {
    grid(
      columns: (1fr, 1fr),
      gutter: 8pt,
      ..((0, 4)).map(start => block(
        d.scale.slice(start, calc.min(start + 4, d.scale.len())).map(cell).join(v(3pt)),
      )),
    )
  }
}

#let remarks-block(height) = {
  label-txt("Remarques du jury")
  v(4pt)
  block(
    width: 100%,
    height: height,
    inset: 8pt,
    radius: 2pt,
    stroke: 0.5pt + hair,
    text(size: 8.5pt)[#d.remarks],
  )
}

// — Feuille 1 : grille d'évaluation du jury ————————————————————————————————
#sheet("Grille d’évaluation", "Appréciation du jury")[
  #criteria-table(true)
  #v(12pt)
  #grid(
    columns: (200pt, 1fr),
    gutter: 22pt,
    block[
      #label-txt("Décisions du jury")
      #v(4pt)
      #for dec in d.decisions [
        #block[
          #tick(dec.checked)
          #h(5pt)
          #text(size: 8.5pt, fill: if dec.checked { ink } else { muted })[#dec.label]
        ]
        #v(6pt)
      ]
    ],
    scale-block(false),
  )
  #v(12pt)
  #remarks-block(1fr)
  #signatures(push: false)
]

// — Feuille 2 : protocole de la soutenance —————————————————————————————————
#pagebreak()
#sheet("Protocole d’évaluation orale", "Synthèse du jury")[
  #block(width: 100%, inset: (x: 10pt, y: 8pt), radius: 2pt, fill: wash)[
    #grid(
      columns: (1fr, auto),
      align: (left + horizon, right + horizon),
      label-txt("Note commune de la soutenance"),
      text(size: 17pt, weight: 700, fill: brand)[#d.protocol.grade],
    )
  ]
  #v(10pt)
  #text(size: 7.5pt, fill: muted)[
    Indiquer les points positifs et négatifs, les questions posées et les principaux
    éléments de réponse. Une prise de notes abrégée suffit.
  ]
  #v(9pt)
  #label-txt("Remarques sur le déroulement de la soutenance")
  #v(4pt)
  #block(width: 100%, height: 96pt, inset: 8pt, radius: 2pt, stroke: 0.5pt + hair)[
    #if d.protocol.proceedings != "" [#text(size: 8.5pt)[#d.protocol.proceedings]] else [
      // Lignes de saisie manuscrite, comme sur la version imprimée actuelle.
      #for i in range(4) [#v(if i == 0 { 12pt } else { 9pt }) #line(length: 100%, stroke: 0.4pt + hair)]
    ]
  ]
  #v(12pt)
  #for f in (
    ("Appréciation de la présentation orale", d.protocol.presentation),
    ("Questions du jury et qualification des réponses", d.protocol.questions),
    ("Évaluation globale de la soutenance", d.protocol.overall),
  ) [
    #block[
      #label-txt(f.at(0))
      #v(4pt)
      #text(size: 8.5pt)[#f.at(1)]
    ]
    #v(15pt)
  ]
  #signatures()
]

// — Feuilles 3 et 4 : grilles individuelles ————————————————————————————————
#for oral in d.orals [
  #pagebreak()
  #sheet("Évaluation " + oral.role, "Grille individuelle")[
    #for g in oral.groups [
      #block(spacing: 11pt)[
        #table(
          columns: (1fr, 42pt, 42pt, 190pt),
          stroke: none,
          inset: (x: 8pt, y: 6pt),
          align: (left, center, center, left),
          table.header(
            table.cell(fill: wash)[#col-label(g.title + " · " + str(g.max) + " points")],
            table.cell(fill: wash, align: center)[#col-label("Points")],
            table.cell(fill: wash, align: center)[#col-label("Max.")],
            table.cell(fill: wash)[#col-label("Remarques")],
          ),
          table.hline(stroke: 0.6pt + rule),
          ..g.rows.map(r => (
            table.cell[#text(size: 8.5pt)[#r.title]],
            table.cell[#text(size: 10pt, weight: 700)[
              #if r.points == none [—] else [#r.points]
            ]],
            table.cell[#text(size: 8.5pt, fill: muted)[#r.max]],
            table.cell[#text(size: 8pt, fill: muted)[#r.comment]],
            table.hline(stroke: 0.4pt + hair),
          )).flatten(),
        )
      ]
    ]
    #v(3pt)
    #block(width: 100%, inset: (x: 10pt, y: 8pt), radius: 2pt, fill: wash)[
      #grid(
        columns: (1fr, auto),
        align: (left + horizon, right + horizon),
        block[
          #text(size: 8pt, fill: muted)[
            Critères : #oral.points / #oral.pointsMax #h(8pt) + #h(8pt)
            Présence : #oral.presence / #oral.presenceMax
          ]
          #v(3pt)
          #text(size: 10.5pt, weight: 700)[Total : #oral.total / #oral.totalMax]
        ],
        block[
          #set align(right)
          #text(size: 13pt, weight: 700)[Note reportée : #text(fill: brand)[#oral.grade]]
          #v(2pt)
          #text(size: 7pt, fill: muted)[Total + 10 · arrondi au dixième]
        ],
      )
    ]
    #signatures()
  ]
]

// — Feuille 5 : synthèse remise à l'étudiant·e —————————————————————————————
#pagebreak()
#sheet("Travail de Bachelor", "Résultats du jury")[
  #criteria-table(false)
  #v(12pt)
  #if d.decisions.at(0).checked [
    #block(spacing: 11pt)[#text(size: 12pt, weight: 700, fill: brand)[Félicitations du jury]]
  ]
  #scale-block(true)
  #v(12pt)
  #remarks-block(1fr)
  #signatures(push: false)
]
