import { useEffect, useState } from 'react';
import {
  ArrowRight,
  FileText,
  GraduationCap,
  LockKeyhole,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Sun,
  Moon,
  CalendarDays,
  ChevronRight,
} from 'lucide-react';
import {
  calculate,
  emptyEvaluation,
  evaluationSchema,
  formatGrade,
  programCode,
  type Evaluation,
  type EvaluationRecord,
  type User,
} from '../shared/evaluation';
import { api } from './api';
import { Field, IdentityFields, Logo, Modal } from './components';
import { Editor } from './Editor';
type Me = { user: User | null; auth: { local: boolean; oidc: boolean } };
const date = (value: string) => value.split('-').reverse().join('.');
export function App() {
  const [me, setMe] = useState<Me | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]),
    [selected, setSelected] = useState<EvaluationRecord | null>(null);
  const [creating, setCreating] = useState(false),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all');
  const [dark, setDark] = useState(() => localStorage.getItem('tb-theme') === 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('tb-theme', dark ? 'dark' : 'light');
  }, [dark]);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await api<Me>('/api/me');
      setMe(result);
      if (result.user)
        setEvaluations(
          (await api<{ evaluations: EvaluationRecord[] }>('/api/evaluations')).evaluations,
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function update(record: EvaluationRecord) {
    setSelected(record);
    setEvaluations((items) => [record, ...items.filter((item) => item.id !== record.id)]);
  }
  if (loading)
    return (
      <div className="loading">
        <Logo />
        <p>Chargement des évaluations…</p>
      </div>
    );
  if (!me)
    return (
      <div className="loading">
        <p role="alert">{error}</p>
        <button onClick={load}>Réessayer</button>
      </div>
    );
  if (!me.user)
    return <Login auth={me.auth} loggedIn={load} dark={dark} toggleTheme={() => setDark(!dark)} />;
  const user = me.user;
  const filtered = evaluations.filter((item) => {
    const d = item.data;
    return (
      `${d.firstName} ${d.lastName} ${d.title} ${programCode(d.program)}`
        .toLocaleLowerCase('fr')
        .includes(search.toLocaleLowerCase('fr')) &&
      (filter === 'all' || (filter === 'locked' ? !!item.lockedAt : !item.lockedAt))
    );
  });
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
          <span className="header-label">Département TIN</span>
          <div className="header-user">
            <button
              className="icon-button"
              aria-label="Changer le thème"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className="user-name">
              {user.name}
              <small>{user.role === 'admin' ? 'Administrateur' : 'Enseignant·e'}</small>
            </span>
            <span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span>
            {!selected && (
              <button
                className="icon-button"
                aria-label="Se déconnecter"
                onClick={async () => {
                  try {
                    await api('/auth/logout', { method: 'POST' });
                    setSelected(null);
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>
      </header>
      {selected ? (
        <Editor
          key={selected.id}
          record={selected}
          updated={update}
          back={() => setSelected(null)}
        />
      ) : (
        <main className="main dashboard">
          <div className="breadcrumb">
            <GraduationCap size={14} /> Travaux de bachelor <ChevronRight size={12} /> Mes
            évaluations
          </div>
          <div className="page-heading">
            <div>
              <span className="eyebrow">ESPACE D’ÉVALUATION</span>
              <h1>
                Mes évaluations<span className="count">{evaluations.length}</span>
              </h1>
              <p>Accompagnez chaque travail, de la revue de projet à la soutenance.</p>
            </div>
            <button className="primary" onClick={() => setCreating(true)}>
              <Plus size={18} /> Nouvelle évaluation
            </button>
          </div>
          {error && (
            <div role="alert" className="alert error">
              {error}
            </div>
          )}
          <div className="stats">
            <Stat label="Évaluations" count={evaluations.length} icon={<FileText size={20} />} />
            <Stat
              label="En cours"
              count={evaluations.filter((e) => !e.lockedAt).length}
              icon={<GraduationCap size={20} />}
            />
            <Stat
              label="Verrouillées"
              count={evaluations.filter((e) => e.lockedAt).length}
              icon={<LockKeyhole size={20} />}
            />
          </div>
          <section className="card list-card">
            <div className="list-tools">
              <div className="segmented" aria-label="Filtrer les évaluations">
                {[
                  ['all', 'Toutes'],
                  ['draft', 'En cours'],
                  ['locked', 'Verrouillées'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={filter === key ? 'active' : ''}
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="Rechercher une évaluation"
                  placeholder="Rechercher un·e étudiant·e, un projet…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            {filtered.length ? (
              <div className="table-scroll">
                <table className="evaluation-list">
                  <thead>
                    <tr>
                      <th>Étudiant·e / Travail de bachelor</th>
                      <th>Filière</th>
                      <th>Soutenance</th>
                      <th>Statut</th>
                      <th>Note</th>
                      <th>
                        <span className="sr-only">Ouvrir</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <button className="student-link" onClick={() => setSelected(item)}>
                            <span className="student-avatar">
                              {item.data.firstName[0]}
                              {item.data.lastName[0]}
                            </span>
                            <span>
                              <strong>
                                {item.data.firstName} {item.data.lastName}
                              </strong>
                              <small>{item.data.title}</small>
                            </span>
                          </button>
                        </td>
                        <td>
                          <span className="program-tag">{programCode(item.data.program)}</span>
                        </td>
                        <td className="nowrap">{date(item.data.defenseDate)}</td>
                        <td>
                          <span className={`badge ${item.lockedAt ? 'locked' : 'draft'}`}>
                            {item.lockedAt ? (
                              <LockKeyhole size={12} />
                            ) : (
                              <span className="status-dot" />
                            )}
                            {item.lockedAt ? 'Verrouillée' : 'En cours'}
                          </span>
                        </td>
                        <td className="list-grade">{formatGrade(calculate(item.data).final)}</td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={`Ouvrir l’évaluation de ${item.data.firstName} ${item.data.lastName}`}
                            onClick={() => setSelected(item)}
                          >
                            <ChevronRight size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-icon">
                  <FileText size={30} />
                </span>
                <h2>
                  {evaluations.length
                    ? 'Aucune évaluation trouvée'
                    : 'Votre première évaluation commence ici'}
                </h2>
                <p>
                  {evaluations.length
                    ? 'Essayez un autre nom, projet ou filtre.'
                    : 'Créez un dossier pour retrouver la grille, la soutenance et les appréciations du jury au même endroit.'}
                </p>
                {!evaluations.length && (
                  <button className="primary" onClick={() => setCreating(true)}>
                    <Plus size={17} /> Créer une évaluation
                  </button>
                )}
              </div>
            )}
            <div className="list-footer">
              {filtered.length} évaluation{filtered.length !== 1 ? 's' : ''}
              <span>Les liens experts donnent accès uniquement à leur partie de l’évaluation.</span>
            </div>
          </section>
          <div className="workflow-note">
            <ShieldCheck size={20} />
            <div>
              <strong>Un dossier complet, jusqu’à la décision du jury.</strong>
              <p>
                Les notes orales sont reportées automatiquement. Une fois finalisée, verrouillez
                l’évaluation et téléchargez le PDF.
              </p>
            </div>
          </div>
        </main>
      )}
      <footer className="footer">
        <span>HEIG-VD · Haute École d’Ingénierie et de Gestion du Canton de Vaud</span>
        <span>Évaluation du travail de bachelor</span>
      </footer>
      {creating && (
        <CreateModal
          teacher={user.role === 'admin' ? '' : user.name}
          close={() => setCreating(false)}
          created={(item) => {
            update(item);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}
function Stat({ label, count, icon }: { label: string; count: number; icon: React.ReactNode }) {
  return (
    <div className="card stat">
      <span className="stat-icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{count}</strong>
      </div>
    </div>
  );
}
function Login({
  auth,
  loggedIn,
  dark,
  toggleTheme,
}: {
  auth: Me['auth'];
  loggedIn: () => Promise<void>;
  dark: boolean;
  toggleTheme: () => void;
}) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    new URLSearchParams(location.search).has('authError')
      ? 'La connexion institutionnelle a échoué ou expiré. Veuillez réessayer.'
      : '',
  );
  const [local, setLocal] = useState(!auth.oidc);
  return (
    <div className="login-page">
      <div className="login-brand">
        <Logo />
        <strong>HEIG Évaluation TB</strong>
        <button className="icon-button" aria-label="Changer le thème" onClick={toggleTheme}>
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
      <main className="login-layout">
        <div className="login-intro">
          <span className="eyebrow">TRAVAUX DE BACHELOR · DÉPARTEMENT TIN</span>
          <h1>
            Chaque projet mérite
            <br />
            une évaluation
            <br />
            <em>à sa hauteur.</em>
          </h1>
          <p>
            Vos grilles d’évaluation, le protocole de soutenance et les appréciations du jury,
            réunis dans un espace commun.
          </p>
          <div className="login-features">
            <span>
              <FileText size={18} /> Une grille fidèle à votre pratique
            </span>
            <span>
              <CalendarDays size={18} /> Du suivi de projet à la soutenance
            </span>
            <span>
              <ShieldCheck size={18} /> Des évaluations conservées et verrouillées
            </span>
          </div>
        </div>
        <section className="card login-card">
          <span className="login-symbol">
            <GraduationCap size={28} />
          </span>
          <h2>Bienvenue</h2>
          <p>Connectez-vous pour retrouver vos évaluations.</p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {auth.oidc && (
            <a href="/auth/login" className="button primary full">
              Connexion institutionnelle <ArrowRight size={18} />
            </a>
          )}
          {auth.local && auth.oidc && (
            <button className="local-toggle" aria-expanded={local} onClick={() => setLocal(!local)}>
              Accès administrateur local
            </button>
          )}
          {auth.local && local && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                try {
                  await api('/auth/local', {
                    method: 'POST',
                    body: JSON.stringify({ email, password }),
                  });
                  await loggedIn();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <fieldset disabled={busy}>
                <Field label="Adresse e-mail administrateur">
                  <input
                    required
                    autoComplete="username"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field label="Mot de passe">
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <button className="primary full" type="submit">
                  {busy ? 'Connexion…' : 'Se connecter'}
                  <ArrowRight size={18} />
                </button>
              </fieldset>
            </form>
          )}
          <div className="login-bottom">
            <LockKeyhole size={13} /> Espace réservé aux responsables d’évaluation
          </div>
        </section>
      </main>
      <footer className="login-footer">
        HEIG-VD · Haute École d’Ingénierie et de Gestion du Canton de Vaud
      </footer>
    </div>
  );
}
function CreateModal({
  teacher,
  close,
  created,
}: {
  teacher: string;
  close: () => void;
  created: (item: EvaluationRecord) => void;
}) {
  const [data, setData] = useState<Evaluation>(() => emptyEvaluation(teacher)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal
      title="Nouvelle évaluation"
      wide
      close={() => {
        if (!busy) close();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          const parsed = evaluationSchema.safeParse(data);
          if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return;
          }
          setBusy(true);
          try {
            created(
              await api('/api/evaluations', { method: 'POST', body: JSON.stringify(parsed.data) }),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="modal-description">
          Commencez par identifier le travail et les membres du jury. Les notes pourront être
          complétées progressivement.
        </p>
        <fieldset disabled={busy}>
          <IdentityFields data={data} change={(patch) => setData({ ...data, ...patch })} />
          {error && (
            <div role="alert" className="alert error">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button type="button" onClick={close}>
              Annuler
            </button>
            <button className="primary" type="submit">
              {busy ? 'Création…' : 'Créer l’évaluation'}
              <ArrowRight size={16} />
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
