import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Copy,
  ChevronRight,
  Download,
  FileText,
  Info,
  LockKeyhole,
  MessageSquareText,
  Pencil,
  Save,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import {
  calculate,
  hasExpertGrade,
  criteria,
  evaluationSchema,
  formatGrade,
  gradeLabel,
  lockingIssues,
  oralCriteria,
  oralGrade,
  protocolFields,
  programCode,
  type Evaluation,
  type EvaluationRecord,
  type Oral,
} from '../shared/evaluation';
import { api, ApiError, fetchPdf } from './api';
import { IdentityFields, Modal, NumberField, TextArea } from './components';
type Tab = 'grid' | 'protocol' | 'teacher' | 'expert';
const tabs = [
  { id: 'grid', label: 'Grille d’évaluation', icon: FileText },
  { id: 'protocol', label: 'Soutenance', icon: MessageSquareText },
  { id: 'teacher', label: 'Oral · Enseignant·e', icon: UserRound },
  { id: 'expert', label: 'Oral · Expert·e', icon: Users },
] as const;
export function Editor({
  record,
  updated,
  back,
}: {
  record: EvaluationRecord;
  updated: (item: EvaluationRecord) => void;
  back: () => void;
}) {
  const [data, setData] = useState(record.data),
    [tab, setTab] = useState<Tab>('grid');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [modal, setModal] = useState<'identity' | 'lock' | 'leave' | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [conflict, setConflict] = useState(false);
  const dirty = JSON.stringify(data) !== JSON.stringify(record.data),
    locked = !!record.lockedAt,
    result = calculate(data);
  const busyRef = useRef(false);
  const change = (patch: Partial<Evaluation>) => {
    setData((d) => ({ ...d, ...patch }));
    setNotice('');
  };
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    // Refresh a clean editor so newly submitted expert notes are visible before validation.
    if (dirty || locked) return;
    let active = true;
    async function refresh() {
      if (busyRef.current) return;
      try {
        const fresh = await api<EvaluationRecord>(`/api/evaluations/${record.id}`);
        if (active && !busyRef.current && fresh.version !== record.version) {
          setData(fresh.data);
          updated(fresh);
          setNotice('Évaluation actualisée avec les dernières modifications.');
        }
      } catch {
        /* The next refresh or explicit action can retry. */
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [dirty, locked, record.id, record.version]);
  async function save(lock = false): Promise<EvaluationRecord | null> {
    const parsed = evaluationSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(' '));
      return null;
    }
    if (!dirty && !lock) return record;
    const saved = await api<EvaluationRecord>(
      `/api/evaluations/${record.id}${lock ? '/lock' : ''}`,
      {
        method: lock ? 'POST' : 'PUT',
        body: JSON.stringify({ version: record.version, data: parsed.data }),
      },
    );
    setData(saved.data);
    updated(saved);
    setNotice(lock ? 'Évaluation verrouillée.' : 'Modifications enregistrées.');
    return saved;
  }
  async function action(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) setConflict(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function pdf(studentOnly = false) {
    await action(async () => {
      const saved = await save();
      if (!saved) return;
      const blob = await fetchPdf(
        `/api/evaluations/${record.id}/pdf${studentOnly ? '?view=student' : ''}`,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `evaluation-${data.lastName}${studentOnly ? '-etudiant' : ''}.pdf`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setNotice('PDF généré et téléchargé.');
    });
  }
  const issues = lockingIssues(data);
  return (
    <main className="main editor">
      <div className="breadcrumb">
        <button onClick={() => (dirty ? setModal('leave') : back())}>
          <ArrowLeft size={14} /> Mes évaluations
        </button>
        <ChevronRight size={12} />
        <span>
          {data.firstName} {data.lastName}
        </span>
      </div>
      <div className="page-heading editor-heading">
        <div>
          <div className="eyebrow">
            TRAVAIL DE BACHELOR{' '}
            <span className={`badge ${locked ? 'locked' : 'draft'}`}>
              {locked ? <LockKeyhole size={12} /> : <span className="status-dot" />}
              {locked ? 'Verrouillée' : 'En cours'}
            </span>
          </div>
          <h1>
            {data.firstName} {data.lastName}
          </h1>
          <p>{data.title}</p>
        </div>
        <div className="heading-actions">
          {!locked && (
            <button
              disabled={busy}
              onClick={() =>
                action(async () => {
                  if (!(await save())) return;
                  const { url } = await api<{ url: string }>(
                    `/api/evaluations/${record.id}/expert-link`,
                    { method: 'POST' },
                  );
                  try {
                    await navigator.clipboard.writeText(url);
                    setNotice('Lien expert copié. La saisie reste ouverte jusqu’au verrouillage.');
                  } catch {
                    setShareUrl(url);
                  }
                })
              }
            >
              <Copy size={16} /> Copier le lien expert
            </button>
          )}
          <button disabled={busy} onClick={() => pdf()}>
            <Download size={16} />
            {busy ? 'Traitement…' : 'Générer le PDF'}
          </button>
          <button disabled={busy} onClick={() => pdf(true)}>
            <Download size={16} /> PDF étudiant·e
          </button>
          {!locked && (
            <button
              className="primary"
              disabled={!dirty || busy}
              onClick={() =>
                action(async () => {
                  await save();
                })
              }
            >
              <Save size={16} />
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </div>
      </div>
      <section className="card identity-strip">
        <div>
          <span>Filière / orientation</span>
          <strong>
            {programCode(data.program)}
            {data.orientation ? ` · ${data.orientation}` : ''}
          </strong>
        </div>
        <div>
          <span>Enseignant·e responsable</span>
          <strong>{data.teacher}</strong>
        </div>
        <div>
          <span>Expert·e</span>
          <strong>{data.expert}</strong>
        </div>
        <div>
          <span>Soutenance</span>
          <strong>
            {data.defenseDate.split('-').reverse().join('.')}
            {data.room ? ` · ${data.room}` : ''}
          </strong>
        </div>
        {!locked && (
          <button
            className="icon-button"
            disabled={busy}
            aria-label="Modifier les informations"
            onClick={() => setModal('identity')}
          >
            <Pencil size={16} />
          </button>
        )}
      </section>
      <div className="editor-status">
        <span role="status">
          {busy
            ? 'Enregistrement en cours…'
            : notice ||
              (dirty
                ? 'Modifications non enregistrées'
                : `Enregistrée le ${new Date(record.updatedAt).toLocaleString('fr-CH')}`)}
        </span>
        <span>
          {locked ? (
            <>
              <LockKeyhole size={13} /> Lecture seule
            </>
          ) : (
            <>
              <CheckCheck size={14} /> Données conservées dans votre espace
            </>
          )}
        </span>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button
            className="icon-button"
            onClick={() => setError('')}
            aria-label="Fermer le message"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {conflict && (
        <div className="alert">
          <span>
            Rechargez la version enregistrée pour retrouver les dernières notes. Vos modifications
            non enregistrées seront abandonnées.
          </span>
          <button
            disabled={busy}
            onClick={() =>
              action(async () => {
                const fresh = await api<EvaluationRecord>(`/api/evaluations/${record.id}`);
                setData(fresh.data);
                updated(fresh);
                setConflict(false);
                setNotice('Dernière version chargée.');
              })
            }
          >
            Recharger la version enregistrée
          </button>
        </div>
      )}
      {shareUrl && (
        <Modal title="Lien pour l’expert·e" close={() => setShareUrl('')}>
          <p>
            Ce lien donne accès aux notes et au formulaire oral de l’expert·e jusqu’au verrouillage.
          </p>
          <label className="field">
            <span>Lien à copier</span>
            <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
          </label>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl);
                setShareUrl('');
                setNotice('Lien expert copié.');
              } catch {
                setNotice('Sélectionnez le lien et copiez-le.');
              }
            }}
          >
            <Copy size={16} /> Copier
          </button>
        </Modal>
      )}
      {locked && (
        <div className="alert success">
          <LockKeyhole size={17} /> Cette évaluation a été verrouillée le{' '}
          {new Date(record.lockedAt!).toLocaleString('fr-CH')}. Vous pouvez la consulter et exporter
          ses documents.
        </div>
      )}
      <nav className="tabs" aria-label="Pages de l’évaluation">
        {tabs.map((t) => (
          <button
            key={t.id}
            aria-current={tab === t.id ? 'page' : undefined}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </nav>
      <div className="editor-layout">
        <div className="editor-content">
          <fieldset disabled={locked || busy}>
            {tab === 'grid' && <Grid data={data} change={change} oralTab={setTab} />}
            {tab === 'protocol' && (
              <section className="card section-card">
                <SectionHeading
                  eyebrow="SOUTENANCE"
                  title="Soutenance"
                  description="Une synthèse commune de l’enseignant·e et de l’expert·e. Une prise de notes abrégée suffit."
                />
                <div className="info-line">
                  <Info size={17} />
                  <span>
                    Indiquez les points positifs et négatifs, ainsi que les principaux éléments des
                    réponses de l’étudiant·e.
                  </span>
                  <span className="mini-grade">{formatGrade(result.means[4])} / 6</span>
                </div>
                <div className="protocol-fields">
                  {protocolFields.map((field, i) => (
                    <TextArea
                      key={field.key}
                      label={field.title}
                      value={data.protocol[field.key]}
                      hint={field.hint}
                      rows={i ? 6 : 4}
                      onChange={(value) =>
                        change({ protocol: { ...data.protocol, [field.key]: value } })
                      }
                    />
                  ))}
                </div>
              </section>
            )}
            {(tab === 'teacher' || tab === 'expert') && (
              <OralGrid
                key={tab}
                role={tab === 'teacher' ? 'Enseignant·e' : 'Expert·e'}
                name={tab === 'teacher' ? data.teacher : data.expert}
                oral={tab === 'teacher' ? data.teacherOral : data.expertOral}
                change={(oral) =>
                  change(tab === 'teacher' ? { teacherOral: oral } : { expertOral: oral })
                }
              />
            )}
          </fieldset>
        </div>
        <aside className="summary">
          <section className="card grade-card">
            <span className="eyebrow">ÉVALUATION GLOBALE</span>
            <div className="final-grade" aria-live="polite">
              {formatGrade(result.final)}
              <span>/ 6</span>
            </div>
            <span
              className={`grade-description ${result.final !== null && result.final < 4 ? 'failed' : ''}`}
            >
              {gradeLabel(result.final)}
            </span>
            <div className="grade-divider" />
            <div className="summary-row">
              <span>Pondération totale</span>
              <strong className={result.totalWeight === 100 ? 'green' : 'amber'}>
                {result.totalWeight} / 100 %
              </strong>
            </div>
            <div className={`weight-track weight-${result.totalWeight}`}>
              <progress max="100" value={result.totalWeight} aria-label="Pondération totale" />
            </div>
            {result.totalWeight !== 100 && (
              <p className="weight-hint">Encore {100 - result.totalWeight} % à répartir.</p>
            )}
            <div className="summary-row">
              <span>Notes renseignées</span>
              <strong>
                {result.filled} / {result.requiredMarks}
              </strong>
            </div>
            <p className="calculation-note">
              Enseignant·e seul·e pour les critères 1 et 2, moyenne du jury pour les suivants. Les
              notes finales affichées sont pondérées, puis le total est arrondi au dixième.
            </p>
            {result.weighted !== null && (
              <div className="summary-row">
                <span>Avant arrondi final</span>
                <strong>{result.weighted.toFixed(3)}</strong>
              </div>
            )}
          </section>
          <section className="card checklist">
            <h3>Finaliser l’évaluation</h3>
            <CheckItem done={result.totalWeight === 100}>Pondération à 100 %</CheckItem>
            <CheckItem done={result.filled === result.requiredMarks}>
              Notes et grilles orales complètes
            </CheckItem>
            <CheckItem
              done={
                !!data.protocol.presentation.trim() &&
                !!data.protocol.questions.trim() &&
                !!data.protocol.overall.trim()
              }
            >
              Soutenance renseignée
            </CheckItem>
            {!locked ? (
              <>
                <button
                  className="full lock-button"
                  disabled={issues.length > 0 || busy}
                  onClick={() => setModal('lock')}
                >
                  <LockKeyhole size={15} /> Verrouiller l’évaluation
                </button>
                <p>Le verrouillage est définitif. Le dossier restera consultable et exportable.</p>
              </>
            ) : (
              <span className="badge locked">
                <LockKeyhole size={12} /> Dossier finalisé
              </span>
            )}
          </section>
          <div className="scale">
            <h3>Échelle d’évaluation</h3>
            {[
              ['5.8 – 6.0', 'A', 'Excellent'],
              ['5.3 – 5.7', 'B', 'Très bien'],
              ['4.8 – 5.2', 'C', 'Bien'],
              ['4.3 – 4.7', 'D', 'Satisfaisant'],
              ['4.0 – 4.2', 'E', 'Passable'],
              ['3.5 – 3.9', 'FX', 'Échec'],
              ['1.0 – 3.4', 'F', 'Échec'],
            ].map(([range, letter, label]) => (
              <div key={letter}>
                <span>{range}</span>
                <b>{letter}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
      {modal === 'identity' && (
        <IdentityModal
          data={data}
          close={() => setModal(null)}
          apply={(patch) => {
            change(patch);
            setModal(null);
          }}
        />
      )}
      {modal === 'lock' && (
        <Modal
          title="Verrouiller l’évaluation ?"
          close={() => {
            if (!busy) setModal(null);
          }}
        >
          <p>
            La note finale de{' '}
            <strong>
              {data.firstName} {data.lastName}
            </strong>{' '}
            est de <strong>{formatGrade(result.final)} / 6</strong>. Les modifications seront
            enregistrées et le dossier ne pourra plus être modifié, y compris par l’administrateur.
          </p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button disabled={busy} onClick={() => setModal(null)}>
              Annuler
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  const saved = await save(true);
                  if (saved) setModal(null);
                })
              }
            >
              <LockKeyhole size={16} />
              {busy ? 'Verrouillage…' : 'Confirmer le verrouillage'}
            </button>
          </div>
        </Modal>
      )}
      {modal === 'leave' && (
        <Modal title="Modifications non enregistrées" close={() => setModal(null)}>
          <p>Enregistrez vos modifications avant de revenir à la liste des évaluations.</p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button disabled={busy} onClick={back}>
              Quitter sans enregistrer
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  if (await save()) back();
                })
              }
            >
              Enregistrer et quitter
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
function CheckItem({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <div className={`check-item ${done ? 'done' : ''}`}>
      <span>{done ? <Check size={12} /> : null}</span>
      {children}
    </div>
  );
}
function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="section-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
function Grid({
  data,
  change,
  oralTab,
}: {
  data: Evaluation;
  change: (patch: Partial<Evaluation>) => void;
  oralTab: (tab: Tab) => void;
}) {
  const result = calculate(data);
  return (
    <>
      <section className="card grid-card">
        <SectionHeading
          eyebrow="APPRÉCIATION DU JURY"
          title="Grille d’évaluation"
          description="Ajustez les pondérations et renseignez les notes de 1.0 à 6.0, au dixième."
        />
        <div className="table-scroll">
          <table className="rubric-table">
            <thead>
              <tr>
                <th>Critères d’évaluation</th>
                <th>Pondération</th>
                <th>Enseignant·e</th>
                <th>Expert·e</th>
                <th>Note finale</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((criterion, i) => (
                <tr key={criterion.id}>
                  <td>
                    <span className="criterion-stage">
                      {i === 0
                        ? 'ÉVALUATION INTERMÉDIAIRE'
                        : i === 1
                          ? 'ÉVALUATION EN FIN DE PROJET'
                          : i === 4
                            ? 'SOUTENANCE ORALE'
                            : ''}
                    </span>
                    <div className="criterion-name">
                      <span>{i + 1}</span>
                      <strong>{criterion.title}</strong>
                    </div>
                    <p>{criterion.description}</p>
                    {i === 4 && (
                      <small className="inherited">
                        <CheckCheck size={12} /> Notes issues des grilles orales
                      </small>
                    )}
                  </td>
                  <td>
                    <div className="weight-input">
                      <NumberField
                        label={`Pondération — ${criterion.title}`}
                        value={data.weights[i]}
                        integer
                        min={criterion.minimum}
                        max={100 - result.totalWeight + data.weights[i]}
                        onChange={(value) => {
                          const weights = [...data.weights];
                          weights[i] = value ?? criterion.minimum;
                          change({ weights });
                        }}
                      />
                      <span>%</span>
                    </div>
                    <small>min. {criterion.minimum} %</small>
                  </td>
                  {(['teacher', 'expert'] as const).map((role) => (
                    <td key={role}>
                      {role === 'expert' && !hasExpertGrade(i) ? (
                        <span
                          aria-label="Non évalué par l’expert·e"
                          title="Évaluation par l’enseignant·e uniquement"
                        >
                          —
                        </span>
                      ) : i < 4 ? (
                        <NumberField
                          label={`${role === 'teacher' ? 'Enseignant·e' : 'Expert·e'} — ${criterion.title}`}
                          value={data[`${role}Marks`][i]}
                          min={1}
                          max={6}
                          onChange={(value) => {
                            const marks = [...data[`${role}Marks`]];
                            marks[i] = value;
                            change({ [`${role}Marks`]: marks });
                          }}
                        />
                      ) : (
                        <button
                          className="inherited-grade"
                          title="Ouvrir la grille orale"
                          onClick={() => oralTab(role)}
                        >
                          {formatGrade(result[role][4])}
                          <ChevronRight size={12} />
                        </button>
                      )}
                    </td>
                  ))}
                  <td>
                    <output className="common-grade">{formatGrade(result.means[i])}</output>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Évaluation globale</td>
                <td className={result.totalWeight === 100 ? 'green' : 'amber'}>
                  {result.totalWeight} %
                </td>
                <td colSpan={2}>Arrondie au dixième</td>
                <td>
                  <strong>{formatGrade(result.final)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <JuryFields data={data} change={change} />
    </>
  );
}
function JuryFields({
  data,
  change,
}: {
  data: Evaluation;
  change: (patch: Partial<Evaluation>) => void;
}) {
  return (
    <section className="card section-card jury-fields">
      <h2>Décisions et remarques du jury</h2>
      <div className="checkboxes">
        <label>
          <input
            type="checkbox"
            checked={data.congratulations}
            onChange={(e) => change({ congratulations: e.target.checked })}
          />{' '}
          Félicitations du jury
        </label>
        <label>
          <input
            type="checkbox"
            checked={data.award}
            onChange={(e) => change({ award: e.target.checked })}
          />{' '}
          Proposition de prix
        </label>
        <label>
          <input
            type="checkbox"
            checked={data.confidential}
            onChange={(e) => change({ confidential: e.target.checked })}
          />{' '}
          Travail confidentiel
        </label>
      </div>
      <div className="checkboxes publication-choice">
        <label className={data.confidential ? 'unavailable' : undefined}>
          <input
            type="checkbox"
            checked={calculate(data).publicationAllowed}
            disabled={data.confidential}
            onChange={(e) => change({ publication: e.target.checked ? 'yes' : 'no' })}
          />
          <span>
            Diffuser le travail sur{' '}
            <a href="https://tb.heig-vd.ch" target="_blank" rel="noreferrer">
              tb.heig-vd.ch
            </a>
          </span>
        </label>
      </div>
      <TextArea
        label="Remarques du jury"
        value={data.remarks}
        onChange={(value) => change({ remarks: value })}
        hint="Remarques éventuelles ou justification en cas d’échec ou de divergences graves entre les membres du jury."
      />
    </section>
  );
}
export function OralGrid({
  role,
  name,
  oral,
  change,
}: {
  role: string;
  name: string;
  oral: Oral;
  change: (oral: Oral) => void;
}) {
  const total = oral.points.reduce<number>((sum, p) => sum + (p ?? 0), 0);
  return (
    <section className="card section-card oral-card">
      <SectionHeading
        eyebrow={`SOUTENANCE · ${role.toLocaleUpperCase('fr')}`}
        title={`Évaluation orale · ${name}`}
        description="Attribuez les points de chaque critère. La note sur 6 est automatiquement reportée dans la grille d’évaluation."
      />
      <div className="oral-summary">
        <span>
          Points saisis <strong>{Number(total.toFixed(1))} / 50</strong>
        </span>
        <span>
          Présence <strong>+ 10 points</strong>
        </span>
        <span>
          Note reportée <strong>{formatGrade(oralGrade(oral))} / 6</strong>
        </span>
      </div>
      {(['expression', 'subject'] as const).map((group) => (
        <div className="oral-group" key={group}>
          <h3>
            {group === 'expression'
              ? 'Maîtrise de l’expression orale'
              : 'Maîtrise du sujet présenté'}
            <span>{group === 'expression' ? '20' : '30'} points</span>
          </h3>
          {oralCriteria.map(
            (criterion, i) =>
              criterion.group === group && (
                <div className="oral-criterion" key={criterion.id}>
                  <div className="oral-criterion-heading">
                    <label htmlFor={`comment-${criterion.id}`}>
                      <span className="criterion-index">{i + 1}</span>
                      {criterion.title}
                    </label>
                    <div className="oral-point-input">
                      <NumberField
                        label={`Points — ${criterion.title}`}
                        value={oral.points[i]}
                        min={0}
                        max={criterion.max}
                        onChange={(value) => {
                          const points = [...oral.points];
                          points[i] = value;
                          change({ ...oral, points });
                        }}
                      />
                      <span>/ {criterion.max}</span>
                    </div>
                  </div>
                  <textarea
                    id={`comment-${criterion.id}`}
                    aria-label={`Remarques — ${criterion.title}`}
                    rows={2}
                    maxLength={12000}
                    placeholder="Observations sur ce critère (facultatif)"
                    value={oral.comments[i]}
                    onChange={(e) => {
                      const comments = [...oral.comments];
                      comments[i] = e.target.value;
                      change({ ...oral, comments });
                    }}
                  />
                </div>
              ),
          )}
        </div>
      ))}
      <div className="info-line">
        <Info size={17} />
        <span>
          Note = (points des critères + 10 points de présence) ÷ 10. Tous les critères doivent être
          renseignés pour reporter la note.
        </span>
      </div>
    </section>
  );
}
function IdentityModal({
  data,
  apply,
  close,
}: {
  data: Evaluation;
  apply: (patch: Evaluation) => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState(data);
  return (
    <Modal title="Informations de l’évaluation" wide close={close}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply(draft);
        }}
      >
        <IdentityFields data={draft} change={(patch) => setDraft({ ...draft, ...patch })} />
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Annuler
          </button>
          <button className="primary" type="submit">
            Appliquer les modifications
          </button>
        </div>
      </form>
    </Modal>
  );
}
