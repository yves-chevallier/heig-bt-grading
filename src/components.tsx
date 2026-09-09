import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
// Même fichier que celui utilisé pour l'en-tête des PDF : une seule source pour
// le logo, dans sa couleur de marque plutôt qu'aplati dans une pastille rouge.
import logoUrl from '../assets/heig-vd.svg';
import { programs, orientations, programCode, type Evaluation } from '../shared/evaluation';
export function Logo() {
  return <img className="logo" src={logoUrl} alt="HEIG-VD" />;
}

// lucide 1.x ne fournit plus les icônes de marque : le sigle GitHub est donc
// tracé ici plutôt qu'importé.
export function GithubMark({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export const REPOSITORY_URL = 'https://github.com/yves-chevallier/heig-bt-grading';

export function GithubLink() {
  return (
    <a
      className="icon-button"
      href={REPOSITORY_URL}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Code source sur GitHub"
      title="Code source sur GitHub"
    >
      <GithubMark />
    </a>
  );
}
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? 'modal wide' : 'modal'}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
    >
      <div className="modal-head">
        <h2 id={id}>{title}</h2>
        <button className="icon-button" aria-label="Fermer" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
export function IdentityFields({
  data,
  change,
}: {
  data: Evaluation;
  change: (patch: Partial<Evaluation>) => void;
}) {
  return (
    <div className="form-grid">
      <Field label="Prénom *">
        <input
          required
          maxLength={300}
          autoComplete="given-name"
          value={data.firstName}
          onChange={(e) => change({ firstName: e.target.value })}
        />
      </Field>
      <Field label="Nom *">
        <input
          required
          maxLength={300}
          autoComplete="family-name"
          value={data.lastName}
          onChange={(e) => change({ lastName: e.target.value })}
        />
      </Field>
      <Field label="Filière *">
        <input
          aria-label="Filière *"
          list="programs"
          required
          maxLength={300}
          placeholder="Sélectionner ou saisir une filière"
          value={programCode(data.program)}
          onChange={(e) => change({ program: e.target.value })}
        />
        <datalist id="programs">
          {programs.map((p) => (
            <option value={p.code} key={p.code}>
              {p.label}
            </option>
          ))}
        </datalist>
      </Field>
      <Field label="Orientation">
        <input
          aria-label="Orientation"
          list="orientations"
          maxLength={300}
          placeholder="Facultatif"
          value={data.orientation}
          onChange={(e) => change({ orientation: e.target.value })}
        />
        <datalist id="orientations">
          {orientations.map((p) => (
            <option value={p.code} key={p.code}>
              {p.label}
            </option>
          ))}
        </datalist>
      </Field>
      <Field label="Titre du travail de bachelor *" className="span-two">
        <input
          required
          maxLength={300}
          placeholder="Titre du projet"
          value={data.title}
          onChange={(e) => change({ title: e.target.value })}
        />
      </Field>
      <Field label="Enseignant·e responsable *">
        <input
          required
          maxLength={300}
          value={data.teacher}
          onChange={(e) => change({ teacher: e.target.value })}
        />
      </Field>
      <Field label="Expert·e *">
        <input
          required
          maxLength={300}
          value={data.expert}
          onChange={(e) => change({ expert: e.target.value })}
        />
      </Field>
      <Field label="Date de soutenance *">
        <input
          required
          type="date"
          value={data.defenseDate}
          onChange={(e) => change({ defenseDate: e.target.value })}
        />
      </Field>
      <Field label="Salle">
        <input
          maxLength={300}
          placeholder="Facultatif"
          value={data.room}
          onChange={(e) => change({ room: e.target.value })}
        />
      </Field>
    </div>
  );
}
export function NumberField({
  value,
  onChange,
  min,
  max,
  label,
  integer = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  max: number;
  label: string;
  integer?: boolean;
}) {
  const show = (n: number | null) => (n === null ? '' : integer ? String(n) : n.toFixed(1));
  const [draft, setDraft] = useState(show(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(show(value));
  }, [value]);
  return (
    <input
      className="number-input"
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      aria-label={label}
      placeholder="—"
      value={draft}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onChange={(e) => {
        const next = e.target.value.replace(',', '.');
        if (!/^\d{0,3}(\.\d?)?$/.test(next) || (integer && next.includes('.'))) return;
        setDraft(next);
        const n = Number(next);
        if (!next && !integer) onChange(null);
        else if (next && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => {
        focused.current = false;
        if (!draft && !integer) {
          onChange(null);
          return;
        }
        const n = draft ? Math.min(max, Math.max(min, Number(draft))) : (value ?? min);
        onChange(n);
        setDraft(show(n));
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const n =
            Math.round(
              Math.min(
                max,
                Math.max(
                  min,
                  (value ?? min) + (e.key === 'ArrowUp' ? 1 : -1) * (integer ? 1 : 0.1),
                ),
              ) * 10,
            ) / 10;
          onChange(n);
          setDraft(show(n));
        }
      }}
    />
  );
}
export function TextArea({
  label,
  value,
  onChange,
  hint,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  rows?: number;
}) {
  return (
    <Field label={label}>
      <textarea
        rows={rows}
        maxLength={12000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
      />
    </Field>
  );
}
