import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { GraduationCap, X } from 'lucide-react';
import { programs, orientations, programCode, type Evaluation } from '../shared/evaluation';
export function Logo() {
  return (
    <span className="logo">
      <GraduationCap size={24} strokeWidth={1.8} aria-hidden="true" />
    </span>
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
