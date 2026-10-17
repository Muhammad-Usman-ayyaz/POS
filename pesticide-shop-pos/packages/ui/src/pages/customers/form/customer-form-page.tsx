import { ApiError, type Api, type CustomerSettingsView, type DuplicateMatchView, type SessionUser } from '@pos/api-contract';
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorNotice, Notice, useToast } from '../../../components/feedback.js';
import { Button } from '../../../components/ui/button.js';
import { Input } from '../../../components/ui/input.js';
import { SegmentedToggle } from '../../../components/ui/segmented.js';
import { formatMoney, useI18n } from '../../../i18n/index.js';
import { cn } from '../../../lib/cn.js';
import { CustomerDuplicateDialog } from './customer-form-duplicate-dialog.js';
import {
  buildCreateRequest,
  buildDuplicatesRequest,
  buildTermsRequest,
  buildUpdateRequest,
  checkDraft,
  draftFromCustomer,
  hasFarmerDetails,
  hasProblems,
  newDraft,
  type CustomerDraft,
  type CustomerProblems,
  type SavedCustomer,
} from './customer-form-requests.js';

const LABEL = 'block text-xs font-bold uppercase tracking-wider text-muted';

/**
 * Add a customer, or edit one: one form for both (docs/design/CustomerForms.dc.html, section 1; the duplicate warning is 1b).
 * Anyone signed in may add or edit the contact fields. Only the owner sees the Terms (credit limit, price type) and, when the shop has
 * switched them on, the farmer details; staff see a note instead and their request carries no terms.
 */
export function CustomerFormPage({ api, user }: { api: Api; user: SessionUser }) {
  const { id } = useParams<{ id: string }>();
  // One form per customer: going from one customer (or from Add) to another must start fresh, never keep what was typed.
  return <Form key={id ?? 'new'} api={api} owner={user.role === 'owner'} />;
}

type Saved = { customer: SavedCustomer };

function Form({ api, owner }: { api: Api; owner: boolean }) {
  const { m, language, dir } = useI18n();
  const f = m.customerForm;
  const toast = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const editing = id !== undefined;

  const [settings, setSettings] = useState<CustomerSettingsView | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [draft, setDraft] = useState<CustomerDraft | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [problems, setProblems] = useState<CustomerProblems>({ name: false, creditLimit: false });
  // After a failed save the messages follow the form: a field that is put right loses its message at once.
  const [checked, setChecked] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [conflict, setConflict] = useState(false);
  const [partial, setPartial] = useState(false);
  const [saving, setSaving] = useState(false);
  const [farmerOpen, setFarmerOpen] = useState(false);
  const [matches, setMatches] = useState<DuplicateMatchView[] | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [shop, summary] = await Promise.all([api.customers.getSettings(), editing ? api.customers.get({ customer_id: id }) : Promise.resolve(null)]);
      setSettings(shop);
      if (summary) {
        setSaved({ customer: summary.customer });
        setDraft(draftFromCustomer(summary.customer));
        setFarmerOpen(hasFarmerDetails(summary.customer));
      } else {
        setDraft(newDraft(shop.default_credit_limit));
      }
    } catch (error) {
      setLoadError(error);
    }
  }, [api, editing, id]);
  useEffect(() => void load(), [load]);

  useEffect(() => {
    if (checked && draft) setProblems(checkDraft(draft, owner));
  }, [checked, draft, owner]);

  const update = (patch: Partial<CustomerDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const showFarmer = owner && settings?.show_farmer_fields === true;

  const finish = (customerId: string, belowBalance: boolean) => {
    toast.show({ tone: 'success', title: f.saved });
    if (belowBalance) toast.show({ tone: 'warning', title: f.belowBalance, duration: 12_000 });
    navigate(`/customers/${customerId}`);
  };

  const save = async (confirmDuplicate = false) => {
    if (!draft || saving) return;
    const found = checkDraft(draft, owner);
    setProblems(found);
    setChecked(hasProblems(found));
    setSaveError(null);
    setConflict(false);
    setPartial(false);
    if (hasProblems(found)) {
      requestAnimationFrame(() => (found.name ? nameRef.current : document.querySelector<HTMLElement>('[aria-invalid=true]'))?.focus());
      return;
    }
    setSaving(true);
    let wrote = false;
    try {
      if (!editing) {
        const created = await api.customers.create(buildCreateRequest(draft, { owner, showFarmer, confirmDuplicate }));
        finish(created.customer.id, false);
        return;
      }
      if (!saved) return;
      let version = saved.customer.version;
      const edit = buildUpdateRequest(saved.customer, draft, version);
      if (edit) {
        const reply = await api.customers.update(edit);
        version = reply.customer.version;
        wrote = true;
      }
      let below = false;
      if (owner) {
        const terms = buildTermsRequest(saved.customer, draft, { expectedVersion: version, showFarmer });
        if (terms) {
          const reply = await api.customers.setTerms(terms);
          below = reply.below_balance;
        }
      }
      finish(saved.customer.id, below);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'DUPLICATE_CUSTOMER' && !editing) {
        // Never blocks: the warning lists who it is, and Save as new sends the same request again with confirm_duplicate.
        try {
          const found = await api.customers.findDuplicates(buildDuplicatesRequest(draft));
          if (found.length > 0) {
            setMatches(found);
            return;
          }
        } catch {
          // fall through to the plain message
        }
        setSaveError(error);
      } else if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        setConflict(true);
      } else {
        setSaveError(error);
      }
      if (editing && wrote) {
        setPartial(true);
        await load(); // show what is saved now
      }
    } finally {
      setSaving(false);
    }
  };

  const reload = async () => {
    setConflict(false);
    setSaveError(null);
    setChecked(false);
    setProblems({ name: false, creditLimit: false });
    await load();
  };

  const shownName = saved ? ((language === 'ur' ? (saved.customer.name_ur ?? saved.customer.name_en) : (saved.customer.name_en ?? saved.customer.name_ur)) ?? '') : '';
  const Back = dir === 'rtl' ? ArrowRight : ArrowLeft;

  if (loadError != null) {
    const gone = loadError instanceof ApiError && (loadError.code === 'NOT_FOUND');
    return (
      <div data-page="customer-form" className="flex flex-wrap items-start gap-3">
        {gone ? <Notice title={f.notFound} className="max-w-xl" /> : <ErrorNotice error={loadError} className="max-w-xl" />}
        {gone ? (
          <Button asChild variant="secondary">
            <Link to="/customers">{f.back}</Link>
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => void load()}>
            {f.retry}
          </Button>
        )}
      </div>
    );
  }
  if (!draft || !settings) {
    return (
      <p role="status" className="stagger text-lg text-muted">
        {f.loading}
      </p>
    );
  }

  const limitPaisa = editing && saved ? saved.customer.credit_limit : settings.default_credit_limit;
  const typedName = draft.nameEn.trim() || draft.nameUr.trim();

  return (
    <form data-page="customer-form" noValidate onSubmit={(e) => (e.preventDefault(), void save())}>
      <Link to="/customers" className="mb-2 inline-flex min-h-11 items-center gap-1 font-semibold text-accent">
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
            <Link to={editing ? `/customers/${id}` : '/customers'}>{f.cancel}</Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? f.saving : f.save}
          </Button>
        </div>
      </header>

      {conflict && (
        <div data-conflict className="mb-4 flex max-w-3xl flex-wrap items-start gap-3">
          <Notice tone="warning" title={f.conflictTitle} next={f.conflictBody} className="min-w-0 flex-1" />
          <Button variant="secondary" onClick={() => void reload()}>
            {f.reload}
          </Button>
        </div>
      )}
      {partial && <Notice tone="warning" title={f.partial} className="mb-4 max-w-3xl" />}
      {saveError != null && <ErrorNotice error={saveError} className="mb-4 max-w-3xl" />}

      <div className="stagger flex max-w-3xl flex-col gap-4 rounded-lg border border-line bg-card p-6 shadow-card" style={{ '--i': 1 } as React.CSSProperties}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField id="name-en" label={f.nameEn} value={draft.nameEn} onChange={(v) => update({ nameEn: v })} invalid={problems.name} error={problems.name ? f.problems.name : undefined} inputRef={nameRef} />
          <TextField id="name-ur" label={f.nameUr} value={draft.nameUr} onChange={(v) => update({ nameUr: v })} invalid={problems.name} ur />
          <TextField id="phone" label={f.phone} value={draft.phone} onChange={(v) => update({ phone: v })} phone />
          <TextField id="village" label={f.village} value={draft.village} onChange={(v) => update({ village: v })} />
        </div>

        {owner ? (
          <section aria-label={f.termsHeading} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className={LABEL}>{f.priceType}</span>
              <SegmentedToggle
                label={f.priceType}
                tone="track"
                value={draft.priceType}
                onChange={(v) => update({ priceType: v })}
                options={[
                  { value: 'retail', label: f.retail },
                  { value: 'wholesale', label: f.wholesale },
                ]}
                className="h-14 rounded-lg bg-thead p-1"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="credit-limit" className={LABEL}>
                {f.creditLimit}
              </label>
              <div dir="ltr" className="relative">
                <span aria-hidden className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-muted">
                  {f.rs}
                </span>
                <Input
                  id="credit-limit"
                  name="creditLimit"
                  inputMode="decimal"
                  value={draft.creditLimit}
                  invalid={problems.creditLimit}
                  aria-describedby={problems.creditLimit ? 'credit-limit-error' : 'credit-limit-hint'}
                  onChange={(e) => update({ creditLimit: e.target.value })}
                  className="num ps-12 text-end"
                />
              </div>
              {problems.creditLimit ? (
                <p id="credit-limit-error" role="alert" className="text-sm font-medium text-danger-ink">
                  {f.problems.creditLimit}
                </p>
              ) : (
                <p id="credit-limit-hint" className="text-sm text-muted">
                  {f.creditLimitHint}
                </p>
              )}
            </div>
          </section>
        ) : (
          <section aria-label={f.termsHeading} data-staff-limit-note className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-tint-soft px-4 py-3 text-sm">
            <span>{f.staffLimitNote}</span>
            {limitPaisa === 0 ? (
              <span data-no-limit className="rounded-[8px] bg-warn-bg px-3 py-1 text-[13px] font-bold text-warn-ink">
                {f.noLimit}
              </span>
            ) : (
              <strong className="num">{editing ? f.staffCustomerLimit(formatMoney(limitPaisa, language)) : f.staffDefaultLimit(formatMoney(limitPaisa, language))}</strong>
            )}
          </section>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="notes" className={LABEL}>
            {f.notes}
          </label>
          <textarea id="notes" name="notes" dir="auto" rows={3} maxLength={500} value={draft.notes} onChange={(e) => update({ notes: e.target.value })} className="w-full rounded-lg border border-field-line bg-card px-4 py-3 text-lg text-ink" />
        </div>

        {showFarmer && (
          <section aria-label={f.farmerHeading} className="rounded-lg border border-line bg-warn-bg/40 p-4">
            <button type="button" aria-expanded={farmerOpen} aria-controls="farmer-fields" onClick={() => setFarmerOpen((o) => !o)} className="flex min-h-11 w-full items-center justify-between gap-3 text-start font-semibold text-accent">
              {farmerOpen ? f.hideFarmer : f.addFarmer}
              <ChevronDown aria-hidden className={cn('size-5 shrink-0 transition-transform', farmerOpen && 'rotate-180')} />
            </button>
            {farmerOpen && (
              <div id="farmer-fields" className="mt-3 flex flex-col gap-4">
                <p className="text-sm text-muted">{f.farmerHint}</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField id="father-name" label={f.fatherName} value={draft.fatherName} onChange={(v) => update({ fatherName: v })} />
                  <TextField id="cnic" label={f.cnic} value={draft.cnic} onChange={(v) => update({ cnic: v })} phone />
                  <TextField id="phone2" label={f.phone2} value={draft.phone2} onChange={(v) => update({ phone2: v })} phone />
                  <TextField id="guarantor" label={f.guarantor} value={draft.guarantor} onChange={(v) => update({ guarantor: v })} />
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <CustomerDuplicateDialog
        matches={matches}
        typedName={typedName}
        busy={saving}
        onCancel={() => setMatches(null)}
        onOpen={(customerId) => navigate(`/customers/${customerId}`)}
        onSaveNew={() => {
          setMatches(null);
          void save(true);
        }}
      />
    </form>
  );
}

function TextField({ id, label, value, onChange, invalid, error, inputRef, ur, phone }: { id: string; label: string; value: string; onChange: (v: string) => void; invalid?: boolean; error?: string | undefined; inputRef?: React.Ref<HTMLInputElement>; ur?: boolean; phone?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <Input
        id={id}
        name={id}
        ref={inputRef}
        value={value}
        invalid={!!invalid}
        {...(ur ? { dir: 'rtl', lang: 'ur' } : phone ? { dir: 'ltr', inputMode: 'tel' as const, className: 'num' } : { dir: 'auto' })}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
