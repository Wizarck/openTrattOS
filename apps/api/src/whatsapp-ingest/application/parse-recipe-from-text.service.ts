import { Injectable, Logger } from '@nestjs/common';

/**
 * Parsed ingredient line, in the shape the recipes BC consumes (post-
 * normalisation to canonical units). Sprint 4 W4 ships the regex stub:
 * `unit` is the literal unit string the user wrote ("g", "ml", "kg",
 * "ud"); the recipes BC's UoM converter does the canonical mapping
 * later.
 */
export interface ParsedIngredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface ParsedRecipeDraft {
  /** Best-effort recipe name extracted from the first line / phrase. */
  name: string;
  /** One entry per detected ingredient. May be empty. */
  ingredients: ParsedIngredient[];
}

/**
 * Sprint 4 W4 (J5) — text-only recipe extraction from a free-form
 * WhatsApp message.
 *
 * **Scope honesty**: this is a regex stub, NOT a Hermes / Claude call.
 * The j5.md spec calls for a multimodal vision model (photo + text). That
 * lands in M2.x with the full Hermes integration. The stub here is good
 * enough for the happy path documented in the spec ("Risotto de setas,
 * 400g champiñones, 200g arroz, 50g parmesano") and for any text message
 * that follows the same "name + comma-separated quantity-unit-ingredient"
 * pattern.
 *
 * Failure modes returned as `null`:
 *  - empty / whitespace-only body
 *  - no recognisable name (first non-empty line)
 *  - no recognisable ingredient lines (regex never matched)
 *
 * Why a regex and not an LLM right now?
 *  - The full LLM path requires (a) Hermes deployed with the
 *    `compose-recipe-from-message` capability, (b) per-org BYO LLM key
 *    (Sprint 4 W2-1b shipped this; uptake unknown), (c) cost budget
 *    routing.
 *  - The skeleton ships now so the webhook + persistence + signature
 *    verification can be reviewed independently of the LLM swap.
 *
 * Follow-up: swap this service for a `HermesParseRecipeService` that
 * calls the MCP `compose-recipe-from-message` capability and falls back
 * to this regex when Hermes is unreachable / disabled.
 */
@Injectable()
export class ParseRecipeFromTextService {
  private readonly logger = new Logger(ParseRecipeFromTextService.name);

  /**
   * Regex matching `<qty><unit-optional-space><ingredient-name>` segments
   * within a comma- or newline-separated list.
   *
   * Captures:
   *  1. qty (integer or decimal, accepts `,` or `.` as decimal separator)
   *  2. unit (g, kg, mg, ml, cl, l, ud, uds, unidad, unidades)
   *  3. name (greedy until next comma / newline)
   *
   * Examples that match:
   *   "400g champiñones"        → 400 "g" "champiñones"
   *   "200 g de arroz"          → 200 "g" "de arroz" (caller may strip "de ")
   *   "1,5 kg de tomates"       → 1.5 "kg" "de tomates"
   *   "2 ud cebolla"            → 2 "ud" "cebolla"
   */
  private static readonly INGREDIENT_RX =
    /(\d+(?:[.,]\d+)?)\s*(g|kg|mg|ml|cl|l|ud|uds|unidad|unidades)\s+([^,\n]+)/gi;

  parse(rawBody: string | null): ParsedRecipeDraft | null {
    if (rawBody === null) return null;
    const text = rawBody.trim();
    if (text.length === 0) return null;

    const name = this.extractName(text);
    if (name === null) return null;

    const ingredients = this.extractIngredients(text);

    // Even a "name only" message returns a draft — the operator can
    // hand-add ingredients in the review surface. The spec scenario
    // emphasises the happy path with ingredients, but rejecting
    // ingredient-less drafts at the parser would lose otherwise valid
    // inspiration messages.
    return { name, ingredients };
  }

  private extractName(text: string): string | null {
    // First non-empty line, stripped of any trailing ":" punctuation.
    const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? '';
    if (firstLine.length === 0) return null;

    // If the first line contains a comma, take the segment before the
    // first comma as the name; otherwise take the whole line up to the
    // first digit (the start of the first ingredient).
    const beforeComma = firstLine.split(',')[0]?.trim() ?? firstLine;
    if (beforeComma.length === 0) return null;

    // If the "before-comma" segment is itself just a quantity (e.g. the
    // message starts directly with "400g champiñones"), there's no
    // recipe name — return null.
    if (/^\d+(?:[.,]\d+)?\s*(g|kg|mg|ml|cl|l|ud|uds|unidad|unidades)\s/i.test(beforeComma)) {
      return null;
    }

    // Strip trailing ":" / "—" the user might have written
    // ("Risotto de setas:" / "Risotto de setas —").
    return beforeComma.replace(/[:\-–—]+\s*$/, '').trim();
  }

  private extractIngredients(text: string): ParsedIngredient[] {
    const out: ParsedIngredient[] = [];
    // Reset lastIndex defensively — the `g` flag means the regex shares
    // state across calls if accidentally reused.
    ParseRecipeFromTextService.INGREDIENT_RX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ParseRecipeFromTextService.INGREDIENT_RX.exec(text)) !== null) {
      const qtyRaw = match[1];
      const unit = (match[2] ?? '').toLowerCase();
      const nameRaw = (match[3] ?? '').trim();
      if (qtyRaw === undefined || nameRaw.length === 0) continue;

      const quantity = Number(qtyRaw.replace(',', '.'));
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      // Strip Spanish article prefixes ("de ", "de los ", "del ", "la ")
      // so we surface the bare ingredient name. Conservative: only the
      // most common ones; misses ("hojas de menta") are left intact.
      const cleanedName = nameRaw
        .replace(/^(de\s+los\s+|de\s+las\s+|del\s+|de\s+la\s+|de\s+el\s+|de\s+)/i, '')
        .trim();
      if (cleanedName.length === 0) continue;

      out.push({ name: cleanedName, quantity, unit });
    }
    return out;
  }
}
