import { ApiError, type Api, type ListedCategory, type SessionUser } from '@pos/api-contract';
import { ArrowLeft, ArrowRight, Lock } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ErrorNotice, Notice, useToast } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Dialog } from '../../components/ui/dialog.js';
import { Input } from '../../components/ui/input.js';
import { Select } from '../../components/ui/select.js';
import { packText, stockText, useI18n } from '../../i18n/index.js';
import { baseUnitOf, parseQuantity } from '@pos/core';
import { buildSaveSteps, blankSize, checkDraft, draftFromSaved, hasProblems, newDraft, unitEditable, type DraftProblems, type ProductDraft, type SavedGroup, type SaveStep, type SizeDraft, type Unit } from './product-form-state.js';
import { SizeCard } from './size-card.js';

const UNITS: Unit[] = ['kg', 'L', 'piece'];
export type Named = { id: string; name_en: string | null; name_ur: string | null };

/**
 * Add a product, or edit one and its sizes. Owner only: staff are sent back to the list (and the shell refuses their writes anyway).
 * A new product is saved in one call. An edit sends only what changed, in order; if a step fails the form is reloaded so it shows
 * what really is saved.
 */
export function ProductFormPage({ api, user }: { api: Api; user: SessionUser }) {
  const { groupId } = useParams<{ groupId: string }>();
  if (user.role !== 'owner') return <Navigate to="/products" replace />;
  // One form per product: going from one product (or from Add) to another must start from that product, never keep what was typed.
  return <OwnerForm key={groupId ?? 'new'} api={api} />;
}

function OwnerForm({ api }: { api: Api }) {
  const { m, language, dir } = useI18n();
  const f = m.productForm;
  const toast = useToast();
  const navigate = useNavigate();
  const { groupId } = useParams<{ groupId: string }>();
  const editing = groupId !== undefined;

  const [saved, setSaved] = useState<SavedGroup | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(editing ? null : newDraft());
  const [loadError, setLoadError] = useState<unknown>(null);
  const [notFound, setNotFound] = useState(false);
  const [problems, setProblems] = useState<DraftProblems>({ name: false, sizes: {} });
  // After a failed save the messages follow the form: a field that is put right loses its message at once.
  const [checked, setChecked] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [partial, setPartial] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lockedKey, setLockedKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [categories, setCategories] = useState<ListedCategory[]>([]);
  const [brands, setBrands] = useState<Named[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (groupId === undefined) return;
    try {
      const page = await api.catalogue.list({ group_id: groupId, include_inactive: true });
      const hit = page.hits[0];
      if (!hit) {
        setNotFound(true);
        return;
      }
      const group: SavedGroup = { group: hit.group, sizes: hit.sizes };
      setSaved(group);
      setDraft(draftFromSaved(group));
      setLoadError(null);
    } catch (error) {
      setLoadError(error);
    }
  }, [api, groupId]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    api.categories.list().then(setCategories, () => undefined);
    api.brands.list().then(setBrands, () => undefined);
  }, [api]);

  // After "Add a new size", the cursor goes to the new card's label.
  useEffect(() => {
    if (!focusKey) return;
    document.querySelector<HTMLInputElement>(`[data-size-key="${focusKey}"] input[name=label]`)?.focus();
    setFocusKey(null);
  }, [focusKey, draft]);

  useEffect(() => {
    if (checked && draft) setProblems(checkDraft(draft));
  }, [checked, draft]);

  const update = (patch: Partial<ProductDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const updateSize = (key: string, patch: Partial<SizeDraft>) => setDraft((d) => (d ? { ...d, sizes: d.sizes.map((s) => (s.key === key ? { ...s, ...patch } : s)) } : d));
  const addSize = () => {
    const size = blankSize();
    setDraft((d) => (d ? { ...d, sizes: [...d.sizes, size] } : d));
    setFocusKey(size.key);
  };
  const removeSize = (key: string) => setDraft((d) => (d ? { ...d, sizes: d.sizes.filter((s) => s.key !== key || s.id !== null) } : d));

  const lockedSize = draft?.sizes.find((s) => s.key === lockedKey) ?? null;
  // The locked size said in its unit ("0.5 L"), worked out from what was typed by the units module.
  const lockedParsed = lockedSize && draft ? parseQuantity(baseUnitOf(draft.unit), lockedSize.packSize) : null;
  const lockedPack = lockedParsed?.ok ? lockedParsed.value : 1;
  const lockedPackLabel = draft ? packText(m, language, baseUnitOf(draft.unit), lockedPack) || stockText(m, language, baseUnitOf(draft.unit), 1, lockedPack) : '';

  const run = async (step: SaveStep): Promise<void> => {
    switch (step.kind) {
      case 'createGroup':
        await api.catalogue.createGroup(step.input);
        return;
      case 'updateGroup':
        await api.catalogue.updateGroup(step.input);
        return;
      case 'updateSize':
        await api.catalogue.updateSize(step.input);
        return;
      case 'addSize':
        await api.catalogue.addSize(step.input);
        return;
      case 'setSizeActive':
        await api.catalogue.setSizeActive(step.input);
        return;
    }
  };

  const save = async () => {
    if (!draft || saving) return;
    const found = checkDraft(draft);
    setProblems(found);
    setChecked(hasProblems(found));
    setSaveError(null);
    setPartial(false);
    if (hasProblems(found)) {
      requestAnimationFrame(() => (found.name ? nameRef.current : document.querySelector<HTMLElement>('[aria-invalid=true]'))?.focus());
      return;
    }
    setSaving(true);
    const steps = buildSaveSteps(draft, saved);
    let done = 0;
    try {
      for (const step of steps) {
        await run(step);
        done += 1;
      }
      toast.show({ tone: 'success', title: f.saved });
      navigate('/products');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PACK_SIZE_LOCKED') {
        // The shell says the pack size cannot change: explain it, next to the size it is about.
        const failed = steps[done];
        setLockedKey(failed && 'key' in failed ? failed.key : null);
      } else {
        setSaveError(error);
      }
      if (editing && done > 0) {
        setPartial(true);
        await load(); // show what is saved now
      }
    } finally {
      setSaving(false);
    }
  };

  const quickAdd = async (kind: 'category' | 'brand', names: { name_en?: string; name_ur?: string }) => {
    const created = kind === 'category' ? await api.categories.create(names) : await api.brands.create(names);
    if (kind === 'category') setCategories(await api.categories.list());
    else setBrands(await api.brands.list());
    update(kind === 'category' ? { categoryId: created.id } : { brandId: created.id });
  };

  const name = (row: Named) => (language === 'ur' ? (row.name_ur ?? row.name_en) : (row.name_en ?? row.name_ur)) ?? '';
  const shownName = useMemo(() => (saved ? ((language === 'ur' ? (saved.group.name_ur ?? saved.group.name_en) : (saved.group.name_en ?? saved.group.name_ur)) ?? '') : ''), [saved, language]);
  const Back = dir === 'rtl' ? ArrowRight : ArrowLeft;

  if (notFound) {
    return (
      <div data-page="product-form">
        <Notice title={f.notFound} className="max-w-xl" />
        <Button asChild variant="secondary" className="mt-4">
          <Link to="/products">{f.back}</Link>
        </Button>
      </div>
    );
  }
  if (loadError != null) {
    return (
      <div data-page="product-form" className="flex flex-wrap items-start gap-3">
        <ErrorNotice error={loadError} className="max-w-xl" />
        <Button variant="secondary" onClick={() => void load()}>
          {m.products.retry}
        </Button>
      </div>
    );
  }
  if (!draft) {
    return (
      <p role="status" className="stagger text-lg text-muted">
        {f.loading}
      </p>
    );
  }

  const canEditUnit = unitEditable(draft);

  return (
    <form data-page="product-form" noValidate onSubmit={(e) => (e.preventDefault(), void save())}>
      <Link to="/products" className="mb-2 inline-flex min-h-11 items-center gap-1 font-semibold text-accent">
        <Back aria-hidden className="size-4" />
        {f.back}
      </Link>
      <header className="stagger mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[32px] font-bold leading-tight">{editing ? f.editTitle(shownName) : f.addTitle}</h1>
          <p className="mt-1 text-base text-muted">{f.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link to="/products">{f.cancel}</Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? f.saving : f.save}
          </Button>
        </div>
      </header>

      {partial && <Notice tone="warning" title={f.partial} className="mb-4 max-w-3xl" />}
      {saveError != null && <ErrorNotice error={saveError} className="mb-4 max-w-3xl" />}

      <div className="stagger rounded-lg border border-line bg-card p-6 shadow-card" style={{ '--i': 1 } as React.CSSProperties}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField id="name-en" label={f.nameEn} value={draft.nameEn} onChange={(v) => update({ nameEn: v })} invalid={problems.name} error={problems.name ? f.problems.name : undefined} inputRef={nameRef} />
          <TextField id="name-ur" label={f.nameUr} value={draft.nameUr} onChange={(v) => update({ nameUr: v })} invalid={problems.name} dirUr />
          <PickWithQuickAdd id="category" label={f.category} value={draft.categoryId} rows={categories} name={name} noneLabel={f.none} onPick={(v) => update({ categoryId: v })} addLabel={f.newCategory} onAdd={(names) => quickAdd('category', names)} />
          <PickWithQuickAdd id="brand" label={f.brand} value={draft.brandId} rows={brands} name={name} noneLabel={f.none} onPick={(v) => update({ brandId: v })} addLabel={f.newBrand} onAdd={(names) => quickAdd('brand', names)} />
        </div>
        <div className="mt-4 grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="unit" className="block text-xs font-bold uppercase tracking-wider text-muted">
              {f.baseUnit}
            </label>
            <Select id="unit" value={draft.unit} disabled={!canEditUnit} onChange={(e) => update({ unit: e.target.value as Unit })}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {m.units.names[u]}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-sm text-muted sm:col-span-1 lg:col-span-3">
            {f.unitHint}
            {!canEditUnit && (
              <>
                {' '}
                <Lock aria-hidden className="inline size-4 align-text-bottom" /> {f.unitLocked}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">{f.sizesHeading}</h2>
        <Button variant="secondary" onClick={addSize}>
          {f.addSize}
        </Button>
      </div>

      <div className="flex flex-col gap-4 pb-8">
        {draft.sizes.map((size, index) => (
          <SizeCard
            key={size.key}
            size={size}
            number={index + 1}
            unit={draft.unit}
            problems={problems.sizes[size.key]}
            onChange={(patch) => updateSize(size.key, patch)}
            onRemove={() => removeSize(size.key)}
            onLockedPackSize={() => setLockedKey(size.key)}
          />
        ))}
      </div>

      <Dialog open={lockedSize !== null} title={f.lockTitle} onClose={() => setLockedKey(null)} icon={<span className="grid size-12 shrink-0 place-items-center rounded-lg bg-warn-bg text-warn-ink"><Lock aria-hidden className="size-6" /></span>}>
        {lockedSize && (
          <>
            <p className="mt-3 text-base">{f.lockBody(lockedPackLabel, stockText(m, language, baseUnitOf(draft.unit), lockedPack, lockedSize.stockTotal), lockedSize.batchCount)}</p>
            <p className="mt-4 rounded-md bg-tint-soft px-4 py-3 text-base">
              <strong>{f.lockNextLead}</strong> {f.lockNext}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button variant="secondary" onClick={() => setLockedKey(null)}>
                {f.keepSize}
              </Button>
              <Button
                onClick={() => {
                  setLockedKey(null);
                  addSize();
                }}
              >
                {f.addNewSize}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </form>
  );
}

function TextField({ id, label, value, onChange, invalid, error, inputRef, dirUr }: { id: string; label: string; value: string; onChange: (v: string) => void; invalid?: boolean; error?: string | undefined; inputRef?: React.Ref<HTMLInputElement>; dirUr?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wider text-muted">
        {label}
      </label>
      <Input id={id} ref={inputRef} value={value} invalid={!!invalid} {...(dirUr ? { dir: 'rtl', lang: 'ur' } : { dir: 'auto' })} aria-describedby={error ? `${id}-error` : undefined} onChange={(e) => onChange(e.target.value)} />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A drop-down of what exists, with a small form beneath it to add one that does not. (Also used for the supplier on Receive stock.) */
export function PickWithQuickAdd({ id, label, value, rows, name, noneLabel, onPick, addLabel, onAdd }: { id: string; label: string; value: string; rows: Named[]; name: (row: Named) => string; noneLabel: string; onPick: (id: string) => void; addLabel: string; onAdd: (names: { name_en?: string; name_ur?: string }) => Promise<void> }) {
  const { m } = useI18n();
  const f = m.productForm;
  const [open, setOpen] = useState(false);
  const [en, setEn] = useState('');
  const [ur, setUr] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await onAdd({ ...(en.trim() ? { name_en: en.trim() } : {}), ...(ur.trim() ? { name_ur: ur.trim() } : {}) });
      setOpen(false);
      setEn('');
      setUr('');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  // Enter in these two boxes adds the new name; it must not save the whole form.
  const enterAdds = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (!busy && (en.trim() !== '' || ur.trim() !== '')) void add();
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wider text-muted">
        {label}
      </label>
      <Select id={id} value={value} onChange={(e) => onPick(e.target.value)}>
        <option value="">{noneLabel}</option>
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {name(row)}
          </option>
        ))}
      </Select>
      {open ? (
        <div className="mt-1 flex flex-col gap-2 rounded-md border border-line bg-page p-3">
          <Input aria-label={`${label}: ${f.nameEn}`} placeholder={f.nameEn} value={en} onChange={(e) => setEn(e.target.value)} onKeyDown={enterAdds} className="h-12" />
          <Input aria-label={`${label}: ${f.nameUr}`} placeholder={f.nameUr} value={ur} dir="rtl" lang="ur" onChange={(e) => setUr(e.target.value)} onKeyDown={enterAdds} className="h-12" />
          {error != null && <ErrorNotice error={error} />}
          <div className="flex gap-2">
            <Button className="h-11 px-4" disabled={busy || (en.trim() === '' && ur.trim() === '')} onClick={() => void add()}>
              {f.quickAdd}
            </Button>
            <Button variant="secondary" className="h-11 px-4" onClick={() => setOpen(false)}>
              {f.quickCancel}
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="min-h-11 self-start text-start text-sm font-semibold text-accent">
          {addLabel}
        </button>
      )}
    </div>
  );
}
