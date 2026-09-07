import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { criteria, formatGrade, oralGrade } from '../shared/evaluation';
import { expertInputSchema, type ExpertEvaluation, type ExpertInput } from '../shared/expert';
import { api, ApiError } from './api';
import { Logo, NumberField } from './components';
import { OralGrid } from './Editor';

export function ExpertEditor() {
  const token = useRef(location.hash.slice(1));
  const [record, setRecord] = useState<ExpertEvaluation | null>(null);
  const [data, setData] = useState<ExpertInput | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const busyRef = useRef(false);
  const dirtyRef = useRef(false);
  const dirty = !!record && JSON.stringify(data) !== JSON.stringify(record.data);
  const locked = !!record?.lockedAt;
  const request = (options: RequestInit = {}) =>
    api<ExpertEvaluation>('/api/expert/evaluation', {
      ...options,
      headers: { Authorization: `Bearer ${token.current}` },
    });
  function accept(fresh: ExpertEvaluation) {
    setRecord(fresh);
    setData(fresh.data);
    dirtyRef.current = false;
    setConflict(false);
  }
  async function load() {
    setError('');
    try {
      accept(await request());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
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
    if (!record || locked) return;
    let active = true;
    async function refresh() {
      if (busyRef.current) return;
      try {
        const fresh = await request();
        if (!active || busyRef.current) return;
        if (fresh.lockedAt) {
          accept(fresh);
          setNotice('Évaluation verrouillée par l’enseignant·e. La saisie est terminée.');
        } else if (!dirtyRef.current) accept(fresh);
      } catch {
        /* Explicit saving reports any access or network error. */
      }
    }
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [!!record, locked]);
  function change(patch: Partial<ExpertInput>) {
    dirtyRef.current = true;
    setData((current) => (current ? { ...current, ...patch } : current));
    setNotice('');
  }
  async function save() {
    if (!record || !data || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const parsed = expertInputSchema.safeParse(data);
      if (!parsed.success) {
        setError('Vérifiez les notes et les points saisis.');
        return;
      }
      accept(
        await request({
          method: 'PUT',
          body: JSON.stringify({ revision: record.revision, data: parsed.data }),
        }),
      );
      setNotice('Modifications enregistrées et transmises à l’enseignant·e.');
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) setConflict(true);
      if (e instanceof ApiError && e.status === 423) {
        const fresh = await request();
        accept(fresh);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <Logo />
            <span>
              HEIG <strong>Évaluation TB</strong>
            </span>
          </div>
          <span className="header-label">Espace expert·e</span>
        </div>
      </header>
      <main className="main expert-editor">
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {!record || !data ? (
          <div className="card empty-state">
            <h1>{error ? 'Évaluation indisponible' : 'Chargement de l’évaluation…'}</h1>
            {error && <button onClick={load}>Réessayer</button>}
          </div>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">ÉVALUATION · EXPERT·E</span>
                <h1>
                  {record.identity.firstName} {record.identity.lastName}
                </h1>
                <p>{record.identity.title}</p>
              </div>
              {!locked && (
                <button className="primary" disabled={busy || !dirty} onClick={save}>
                  <Save size={16} /> {busy ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              )}
            </div>
            <section className="card identity-strip">
              <div>
                <span>Filière / orientation</span>
                <strong>
                  {record.identity.program}
                  {record.identity.orientation ? ` · ${record.identity.orientation}` : ''}
                </strong>
              </div>
              <div>
                <span>Enseignant·e responsable</span>
                <strong>{record.identity.teacher}</strong>
              </div>
              <div>
                <span>Expert·e</span>
                <strong>{record.identity.expert}</strong>
              </div>
              <div>
                <span>Soutenance</span>
                <strong>
                  {record.identity.defenseDate.split('-').reverse().join('.')}
                  {record.identity.room ? ` · ${record.identity.room}` : ''}
                </strong>
              </div>
            </section>
            <p className="editor-status" role="status">
              {notice ||
                (locked
                  ? 'Évaluation verrouillée · Lecture seule'
                  : dirty
                    ? 'Modifications non enregistrées'
                    : 'Vos notes sont enregistrées.')}
            </p>
            {conflict && (
              <div className="alert">
                <span>
                  Le rechargement remplacera vos modifications non enregistrées par les dernières
                  notes sauvegardées.
                </span>
                <button disabled={busy} onClick={load}>
                  Recharger les notes enregistrées
                </button>
              </div>
            )}
            <fieldset disabled={busy || locked}>
              <section className="card section-card">
                <div className="section-heading">
                  <h2>Grille d’évaluation · Expert·e</h2>
                  <p>
                    Saisissez vos notes de 1.0 à 6.0, au dixième. La note de soutenance provient de
                    votre formulaire oral ci-dessous.
                  </p>
                </div>
                <div className="table-scroll">
                  <table className="expert-marks">
                    <thead>
                      <tr>
                        <th>Critères d’évaluation</th>
                        <th>Votre note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {criteria.slice(2).map((criterion, i) => (
                        <tr key={criterion.id}>
                          <td>
                            <strong>
                              {i + 3}. {criterion.title}
                            </strong>
                            <p>{criterion.description}</p>
                          </td>
                          <td>
                            {i === 2 ? (
                              <output aria-label="Note expert — Qualité de la soutenance">
                                {formatGrade(oralGrade(data.expertOral))}
                              </output>
                            ) : (
                              <NumberField
                                label={`Note expert — ${criterion.title}`}
                                value={i === 0 ? data.reportMark : data.workMark}
                                min={1}
                                max={6}
                                onChange={(value) =>
                                  change(i === 0 ? { reportMark: value } : { workMark: value })
                                }
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <OralGrid
                role="Expert·e"
                name={record.identity.expert}
                oral={data.expertOral}
                change={(oral) => change({ expertOral: oral })}
              />
            </fieldset>
            {!locked && (
              <div className="modal-actions">
                <button className="primary" disabled={busy || !dirty} onClick={save}>
                  <Save size={16} /> Enregistrer
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
