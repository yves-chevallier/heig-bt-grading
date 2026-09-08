// Modèle Typst des PDF d'évaluation de travail de bachelor.
//
// Ce fichier expose `render(d, student: false)`, que le serveur (server/pdf.ts)
// importe avec des données inlinées, et que typst/exemple.typ appelle sur
// exemple.json pour l'aperçu local :
//   pnpm pdf:data && pnpm pdf:typst
// Les données arrivent déjà calculées (moyennes, arrondis, mention) depuis
// server/pdf-data.ts : ce fichier ne fait que mettre en page.
//
// `student: true` ne produit que la feuille de résultats remise à l'étudiant·e.

// — Palette ————————————————————————————————————————————————————————————————
// Le rouge est celui du logo HEIG-VD (#da291c). Il ne sert qu'à signaler :
// notes insuffisantes (< 4.0), félicitations. Tout le reste est en gris.
#let brand = rgb("#da291c")
#let ink = rgb("#1a1a1a")
#let muted = rgb("#6b6b6b")
#let hair = rgb("#d9d9d9")
#let rule = rgb("#9a9a9a")
#let wash = rgb("#f6f6f6")

// Couleur d'une note : rouge sous 4.0. La note arrive en chaîne, et peut être
// vide ou « — » quand elle manque.
#let grade-color(v) = if v.match(regex("^\d+(\.\d+)?$")) != none and float(v) < 4.0 { brand } else { ink }

// Marge commune aux quatre côtés, aussi utilisée pour mesurer l'espace restant.
#let margin = 1.5cm

#let render(d, student: false) = [
  #set document(title: "Évaluation TB — " + d.meta.student, author: "HEIG-VD · Département TIN")
  #set page(
    paper: "a4",
    margin: margin,
    footer: context {
      let n = here().page()
      // Les feuilles du jury sont numérotées ; la feuille de résultats, qui
      // commence à l'étiquette <student-sheet>, en est exclue.
      let jury-pages = query(<student-sheet>).first().location().page() - 1
      set text(size: 7pt, fill: muted)
      grid(
        columns: (1fr, auto),
        align(left)[#d.meta.status · Version #d.meta.version],
        align(right)[#if n <= jury-pages [Page #n sur #jury-pages] else [Feuille de résultats]],
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

  // En-tête : logo à gauche, titre à droite. Même position
  // qu'actuellement, mais le logo garde sa couleur de marque au lieu d'être aplati
  // en noir.
  #let head(title, tag) = {
    grid(
      columns: (auto, 1fr),
      align: (left + top, right + top),
      image("../assets/heig-vd.svg", height: 1.8cm),
      block[
        #text(size: 19pt, weight: 700, tracking: -0.3pt)[#title]
        #v(1pt)
        #text(size: 8pt, fill: muted)[Département TIN · #tag]
      ],
    )
    v(14pt)
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

  // Signatures : uniquement sur la grille du jury et la feuille de résultats.
  #let signatures() = {
    grid(
      columns: (1fr, 1fr),
      gutter: 24pt,
      ..([Signature de l’enseignant·e responsable], [Signature de l’expert·e]).map(l => block[
        #v(50pt)
        #line(length: 100%, stroke: 0.5pt + rule)
        #v(2pt)
        #label-txt(l)
      ]),
    )
    // Sans le filet du pied de page, un peu d'air avant la ligne de statut.
    v(6pt)
  }

  // Case à cocher : carré gris, croix fine en encre si la décision est prise.
  #let tick(on) = box(
    width: 8pt, height: 8pt, baseline: 1pt,
    stroke: 0.6pt + rule,
  )[#if on [
    #place(line(start: (1.5pt, 1.5pt), end: (6.5pt, 6.5pt), stroke: 0.7pt + ink))
    #place(line(start: (6.5pt, 1.5pt), end: (1.5pt, 6.5pt), stroke: 0.7pt + ink))
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
          align: if i == 0 { left } else { center },
        )[#label-txt(c)]),
      ),
      table.hline(stroke: 0.6pt + rule),

      ..d.criteria.enumerate().map(((i, c)) => {
        // La cellule de pondération reprend une ligne masquée de même hauteur
        // que la phase (un seul glyphe, pour ne pas passer à la ligne dans une
        // colonne étroite) afin que le nombre soit sur la ligne du titre.
        let phase(shown) = if c.phase != "" [
          #text(size: 6.5pt, fill: muted)[#if shown [#c.phase] else [#hide[x]]]
          #v(2pt)
        ]
        let cells = (
          table.cell[
            #phase(true)
            #text(size: 8.5pt, weight: 700)[#c.number. #c.title]
            #v(1.5pt)
            #text(size: 7.5pt, fill: muted)[#c.description]
          ],
          table.cell[
            #phase(false)
            #text(size: 8.5pt, weight: 700)[#c.weight #h(1.5pt)%]
          ],
        )
        // Les notes ont un corps plus grand que le titre : on force leur bord
        // supérieur à la hauteur de capitale du titre (Lato à 8.5pt) pour que
        // leur ligne de base coïncide avec celle du titre.
        let grade(size, weight, v) = table.cell[
          #phase(false)
          #text(size: size, weight: weight, top-edge: 6.1pt, fill: grade-color(v))[#v]
        ]
        let grades = if jury {
          (grade(10pt, 400, c.teacher), grade(10pt, 400, c.expert), grade(11pt, 700, c.final))
        } else { (grade(11pt, 700, c.final),) }
        // Un filet seulement entre deux phases (et avant la synthèse) : les
        // critères d'une même phase restent groupés.
        let last = i == d.criteria.len() - 1
        let sep = if last or d.criteria.at(i + 1).phase != "" {
          (table.hline(stroke: 0.4pt + hair),)
        } else { () }
        (..cells, ..grades, ..sep)
      }).flatten(),

      // Ligne de synthèse.
      table.cell[
        #text(size: 10.5pt, weight: 700)[Évaluation globale]
        #v(1.5pt)
        #text(size: 7pt, fill: muted)[Avant arrondi final : #d.overall.beforeRounding · #d.overall.mention]
      ],
      table.cell[#text(size: 10.5pt, weight: 700)[#d.overall.weight #h(1.5pt)%]],
      ..if jury { ([], []) } else { () },
      table.cell[#text(size: 11pt, weight: 700, fill: grade-color(d.overall.final))[#d.overall.final]],
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
      // Trois colonnes de largeur fixe (plage, lettre, libellé) pour que les
      // libellés s'alignent d'une ligne à l'autre.
      #grid(
        columns: (30pt, 13pt, 1fr),
        column-gutter: 5pt,
        text(size: 7pt, weight: if s.active { 700 } else { 400 })[#s.range],
        text(size: 7pt, weight: 700, fill: if s.active { ink } else { muted })[#s.code],
        text(size: 7pt, fill: if s.active { ink } else { muted })[#s.label],
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

  // Encadré dont la hauteur s'adapte : `frame(h)` construit l'encadré pour une
  // hauteur donnée ; `below` est ce qui doit encore tenir sous lui sur la page
  // (signatures). S'il reste de la place, l'encadré remplit la page ; sinon il
  // prend sa hauteur naturelle et se poursuit sur la page suivante.
  #let fill-or-flow(frame, below: none) = context {
    let width = page.width - 2 * margin
    let reserved = if below == none { 0pt } else { measure(below, width: width).height + 6pt }
    let available = page.height - margin - here().position().y - reserved
    let natural = measure(frame(auto), width: width).height
    if natural <= available { frame(available) } else { frame(auto) }
  }

  #let remarks-block() = {
    label-txt("Remarques du jury")
    v(4pt)
    fill-or-flow(below: signatures(), h => block(
      width: 100%,
      height: h,
      inset: 8pt,
      radius: 2pt,
      stroke: 0.5pt + hair,
      breakable: true,
      text(size: 8.5pt)[#d.remarks],
    ))
  }

  #if not student [
    // — Feuille 1 : grille d'évaluation du jury ——————————————————————————————
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
      #remarks-block()
      #signatures()
    ]

    // — Feuille 2 : protocole de la soutenance ———————————————————————————————
    #pagebreak()
    #sheet("Protocole d’évaluation orale", "Synthèse du jury")[
      #block(width: 100%, inset: (x: 10pt, y: 8pt), radius: 2pt, stroke: 0.5pt + hair)[
        #grid(
          columns: (1fr, auto),
          align: (left + horizon, right + horizon),
          label-txt("Note commune de la soutenance"),
          text(size: 17pt, weight: 700, fill: grade-color(d.protocol.grade))[#d.protocol.grade],
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
      // Cadre toujours présent, avec des lignes pour une saisie manuscrite. Il
      // fait au moins 96pt et s'allonge avec le texte saisi.
      #let proceedings(h) = block(width: 100%, height: h, inset: 8pt, radius: 2pt, stroke: 0.5pt + hair, breakable: true)[
        #if d.protocol.proceedings != "" [#text(size: 8.5pt)[#d.protocol.proceedings]] else [
          #text(size: 8.5pt, fill: muted)[Aucune remarque]
        ]
        #for i in range(4) [#v(if i == 0 { 12pt } else { 9pt }) #line(length: 100%, stroke: 0.4pt + hair)]
      ]
      #context {
        let natural = measure(proceedings(auto), width: page.width - 2 * margin).height
        proceedings(if natural < 96pt { 96pt } else { auto })
      }
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
                table.cell[#col-label(g.title + " · " + str(g.max) + " points")],
                table.cell(align: center)[#col-label("Points")],
                table.cell(align: center)[#col-label("Max.")],
                table.cell[#col-label("Remarques")],
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
              #text(size: 13pt, weight: 700)[Note reportée : #text(fill: grade-color(oral.grade))[#oral.grade]]
              #v(2pt)
              #text(size: 7pt, fill: muted)[Total + 10 · arrondi au dixième]
            ],
          )
        ]
      ]
    ]

    #pagebreak()
  ]

  // — Feuille 5 : synthèse remise à l'étudiant·e ———————————————————————————
  #[#metadata(none) <student-sheet>]
  #sheet("Travail de Bachelor", "Résultats du jury")[
    #criteria-table(false)
    #v(12pt)
    #if d.decisions.at(0).checked [
      #block(spacing: 11pt)[#text(size: 12pt, weight: 700, fill: brand)[Félicitations du jury]]
    ]
    #scale-block(true)
    #v(12pt)
    #remarks-block()
    #signatures()
  ]
]
