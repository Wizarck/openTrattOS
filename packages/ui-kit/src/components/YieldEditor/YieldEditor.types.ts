export type AiSuggestionStatus = 'pending' | 'accepted' | 'rejected';

export interface AiSuggestionShape {
  id: string;
  /** Numeric value in `[0, 1]` — yield% or wasteFactor as a fraction. */
  value: number;
  citationUrl: string;
  snippet: string;
  modelName: string;
  status: AiSuggestionStatus;
  acceptedValue?: number | null;
}

export interface YieldEditorProps {
  /** Yield as a fraction in `[0, 1]` — e.g. 0.85 for 85%. */
  value: number;
  /** Manual edit handler. */
  onChange: (value: number) => void;

  /** When false, AI affordances are hidden; component degrades to a plain number input. */
  aiEnabled: boolean;

  /** Suggestion currently surfaced; null = none yet. */
  suggestion?: AiSuggestionShape | null;
  /** True when the AI returned no result (iron-rule no-citation path). */
  noCitationAvailable?: boolean;
  /** True while the AI request is in-flight. */
  loading?: boolean;
  /** Optional error message to render inline (e.g. provider unreachable). */
  errorMessage?: string;

  /** Triggered when chef clicks "Sugerir IA". */
  onRequestSuggestion: () => void;
  /** Accept the surfaced suggestion. `tweakValue` populated when chef chose a different number. */
  onAccept: (tweakValue?: number) => void;
  /** Reject with required reason ≥10 chars. */
  onReject: (reason: string) => void;

  /** Disabled state (read-only). */
  disabled?: boolean;
  className?: string;
}

export const MIN_REJECT_REASON_LENGTH = 10;
