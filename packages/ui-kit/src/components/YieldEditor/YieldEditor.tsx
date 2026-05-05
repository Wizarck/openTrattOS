import { useState } from 'react';
import { cn } from '../../lib/cn';
import {
  MIN_REJECT_REASON_LENGTH,
  type AiSuggestionShape,
  type YieldEditorProps,
} from './YieldEditor.types';

/**
 * Yield% editor with AI-suggestion + citation popover + chef-override flow per
 * FR16 / FR18 / FR19. Component is presentational — the consumer owns the
 * suggest / accept / reject mutations + state machine.
 *
 * Iron rule (FR19): when `noCitationAvailable=true` the editor surfaces
 * "manual entry only — no citation available" inline; AI affordances stay
 * disabled until the chef triggers a fresh suggestion.
 *
 * When `aiEnabled=false` the AI affordances disappear entirely and the
 * component degrades to a plain number input.
 */
export function YieldEditor(props: YieldEditorProps) {
  return (
    <AiSuggestionEditor
      kind="yield"
      title="Yield"
      label="Rendimiento"
      helpText="Fracción del producto bruto que llega al plato (0-100%)."
      {...props}
    />
  );
}

/**
 * Internal shared editor — same shape powers `YieldEditor` and
 * `WasteFactorEditor`. Exposed here so the wasteFactor editor can compose it
 * without duplicating the 200 LOC of state + ARIA + popover logic.
 */
export function AiSuggestionEditor(
  props: YieldEditorProps & {
    kind: 'yield' | 'waste';
    title: string;
    label: string;
    helpText: string;
  },
) {
  const {
    value,
    onChange,
    aiEnabled,
    suggestion,
    noCitationAvailable,
    loading,
    errorMessage,
    onRequestSuggestion,
    onAccept,
    onReject,
    disabled,
    className,
    title,
    label,
    helpText,
    kind,
  } = props;

  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [tweakValuePct, setTweakValuePct] = useState<string>('');
  const [showCitation, setShowCitation] = useState(false);

  const valuePct = Math.round(value * 1000) / 10; // 1 decimal of percent
  const showSuggestion = aiEnabled && suggestion && suggestion.status === 'pending';
  const showAcceptedBadge = aiEnabled && suggestion && suggestion.status === 'accepted';
  const showRejectedBadge = aiEnabled && suggestion && suggestion.status === 'rejected';

  function commitTweak() {
    const parsed = Number(tweakValuePct);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(0, Math.min(100, parsed)) / 100;
    onAccept(clamped);
    setTweakValuePct('');
  }

  function commitReject() {
    if (rejectReason.trim().length < MIN_REJECT_REASON_LENGTH) return;
    onReject(rejectReason.trim());
    setRejectReason('');
    setShowRejectForm(false);
  }

  return (
    <div
      role="group"
      aria-label={`${title} editor`}
      className={cn('flex flex-col gap-2', className)}
      data-testid={`${kind}-editor`}
    >
      <label className="text-sm font-medium" htmlFor={`${kind}-input`}>
        {label}
      </label>

      <div className="flex items-center gap-2">
        <input
          id={`${kind}-input`}
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={Number.isFinite(valuePct) ? valuePct : 0}
          onChange={(e) => {
            const pct = Number(e.target.value);
            if (!Number.isFinite(pct)) return;
            onChange(Math.max(0, Math.min(100, pct)) / 100);
          }}
          disabled={disabled}
          aria-describedby={`${kind}-help`}
          className="w-24 rounded border border-border bg-surface-1 px-2 py-1 text-sm"
          data-testid={`${kind}-input`}
        />
        <span className="text-sm text-mute">%</span>
        {aiEnabled && (
          <button
            type="button"
            aria-label={`Sugerir IA para ${title.toLowerCase()}`}
            onClick={onRequestSuggestion}
            disabled={disabled || loading || !!showSuggestion}
            className={cn(
              'rounded bg-accent px-3 py-1 text-sm font-medium text-on-accent',
              'hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50',
            )}
            data-testid={`${kind}-suggest-button`}
          >
            {loading ? 'Sugiriendo…' : 'Sugerir IA'}
          </button>
        )}
      </div>

      <p id={`${kind}-help`} className="text-xs text-mute">
        {helpText}
      </p>

      {errorMessage && (
        <div
          role="alert"
          className="rounded border border-error bg-error-soft p-2 text-sm"
          data-testid={`${kind}-error`}
        >
          {errorMessage}
        </div>
      )}

      {aiEnabled && noCitationAvailable && !suggestion && (
        <div
          role="status"
          aria-live="polite"
          className="rounded border border-border bg-warn-bg p-2 text-sm"
          data-testid={`${kind}-no-citation`}
        >
          Manual entry only — no citation available.
        </div>
      )}

      {showSuggestion && suggestion && (
        <PendingSuggestionBlock
          kind={kind}
          suggestion={suggestion}
          showCitation={showCitation}
          onToggleCitation={() => setShowCitation((s) => !s)}
          showRejectForm={showRejectForm}
          rejectReason={rejectReason}
          tweakValuePct={tweakValuePct}
          onChangeTweakPct={setTweakValuePct}
          onChangeRejectReason={setRejectReason}
          onAcceptAsIs={() => onAccept()}
          onAcceptTweak={commitTweak}
          onShowRejectForm={() => setShowRejectForm(true)}
          onCancelReject={() => {
            setShowRejectForm(false);
            setRejectReason('');
          }}
          onCommitReject={commitReject}
        />
      )}

      {showAcceptedBadge && suggestion && (
        <AcceptedBadge kind={kind} suggestion={suggestion} />
      )}

      {showRejectedBadge && suggestion && <RejectedBadge kind={kind} />}
    </div>
  );
}

interface PendingBlockProps {
  kind: 'yield' | 'waste';
  suggestion: AiSuggestionShape;
  showCitation: boolean;
  onToggleCitation: () => void;
  showRejectForm: boolean;
  rejectReason: string;
  tweakValuePct: string;
  onChangeTweakPct: (s: string) => void;
  onChangeRejectReason: (s: string) => void;
  onAcceptAsIs: () => void;
  onAcceptTweak: () => void;
  onShowRejectForm: () => void;
  onCancelReject: () => void;
  onCommitReject: () => void;
}

function PendingSuggestionBlock(props: PendingBlockProps) {
  const {
    kind,
    suggestion,
    showCitation,
    onToggleCitation,
    showRejectForm,
    rejectReason,
    tweakValuePct,
    onChangeTweakPct,
    onChangeRejectReason,
    onAcceptAsIs,
    onAcceptTweak,
    onShowRejectForm,
    onCancelReject,
    onCommitReject,
  } = props;
  const suggestedPct = Math.round(suggestion.value * 1000) / 10;
  const reasonValid = rejectReason.trim().length >= MIN_REJECT_REASON_LENGTH;

  return (
    <div
      role="region"
      aria-label="AI suggestion"
      className="rounded border border-accent-strong bg-surface-2 p-3 text-sm flex flex-col gap-2"
      data-testid={`${kind}-suggestion-pending`}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <strong>IA sugiere:</strong> {suggestedPct}% ·{' '}
          <button
            type="button"
            aria-expanded={showCitation}
            aria-controls={`${kind}-citation-popover`}
            onClick={onToggleCitation}
            className="underline text-accent-strong"
            data-testid={`${kind}-citation-toggle`}
          >
            ver cita
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAcceptAsIs}
            className="rounded bg-success px-3 py-1 text-on-success text-sm font-medium"
            data-testid={`${kind}-accept-button`}
          >
            Aceptar
          </button>
          <button
            type="button"
            onClick={onShowRejectForm}
            className="rounded border border-border bg-surface-1 px-3 py-1 text-sm font-medium"
            data-testid={`${kind}-reject-button`}
          >
            Rechazar
          </button>
        </div>
      </div>

      <div
        id={`${kind}-citation-popover`}
        role="region"
        aria-label="Citation source"
        hidden={!showCitation}
        className={cn(!showCitation && 'sr-only', 'mt-1 rounded bg-surface-1 p-2 text-xs')}
        data-testid={`${kind}-citation-popover`}
      >
        <div>
          <strong>Fuente:</strong>{' '}
          <a
            href={suggestion.citationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            data-testid={`${kind}-citation-url`}
          >
            {suggestion.citationUrl}
          </a>
        </div>
        <div className="mt-1 italic text-mute" data-testid={`${kind}-citation-snippet`}>
          {suggestion.snippet}
        </div>
        <div className="mt-1 text-mute">Modelo: {suggestion.modelName}</div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <label className="text-xs">
          Aceptar con valor distinto:
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={tweakValuePct}
            onChange={(e) => onChangeTweakPct(e.target.value)}
            placeholder={`${suggestedPct}`}
            className="ml-2 w-20 rounded border border-border bg-surface-1 px-2 py-0.5 text-xs"
            data-testid={`${kind}-tweak-input`}
          />
          <span className="ml-1 text-xs">%</span>
        </label>
        <button
          type="button"
          onClick={onAcceptTweak}
          disabled={tweakValuePct === '' || !Number.isFinite(Number(tweakValuePct))}
          className="rounded border border-border bg-surface-1 px-2 py-0.5 text-xs disabled:opacity-50"
          data-testid={`${kind}-accept-tweak-button`}
        >
          Aceptar tweak
        </button>
      </div>

      {showRejectForm && (
        <div className="mt-1 flex flex-col gap-1" data-testid={`${kind}-reject-form`}>
          <label className="text-xs">
            Motivo (≥10 caracteres):
            <textarea
              value={rejectReason}
              onChange={(e) => onChangeRejectReason(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded border border-border bg-surface-1 px-2 py-1 text-xs"
              data-testid={`${kind}-reject-reason-input`}
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCommitReject}
              disabled={!reasonValid}
              className="rounded bg-error px-2 py-0.5 text-on-error text-xs disabled:opacity-50"
              data-testid={`${kind}-reject-confirm-button`}
            >
              Confirmar rechazo
            </button>
            <button
              type="button"
              onClick={onCancelReject}
              className="rounded border border-border bg-surface-1 px-2 py-0.5 text-xs"
              data-testid={`${kind}-reject-cancel-button`}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AcceptedBadge({
  kind,
  suggestion,
}: {
  kind: 'yield' | 'waste';
  suggestion: AiSuggestionShape;
}) {
  const effective =
    suggestion.acceptedValue !== null && suggestion.acceptedValue !== undefined
      ? suggestion.acceptedValue
      : suggestion.value;
  const wasTweaked =
    suggestion.acceptedValue !== null && suggestion.acceptedValue !== undefined;
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded border border-success bg-success-soft p-2 text-sm"
      data-testid={`${kind}-accepted-badge`}
    >
      Aceptado: {Math.round(effective * 1000) / 10}%
      {wasTweaked && (
        <span className="ml-1 text-xs text-mute">
          (tweak — IA sugirió {Math.round(suggestion.value * 1000) / 10}%)
        </span>
      )}
    </div>
  );
}

function RejectedBadge({ kind }: { kind: 'yield' | 'waste' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded border border-error bg-error-soft p-2 text-sm"
      data-testid={`${kind}-rejected-badge`}
    >
      Rechazado.
    </div>
  );
}
