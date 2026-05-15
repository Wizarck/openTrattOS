export type ScopeKey =
  | 'haccp'
  | 'lot'
  | 'procurement'
  | 'photo'
  | 'ai_obs';

export type Scope = Readonly<Record<ScopeKey, boolean>>;

export interface ScopeRowDefinition {
  key: ScopeKey;
  label: string;
  description: string;
}

export interface ScopeCheckboxListProps {
  value: Scope;
  onChange: (next: Scope) => void;
  /** Optional row override (mostly for testing). */
  rows?: ReadonlyArray<ScopeRowDefinition>;
  className?: string;
}
