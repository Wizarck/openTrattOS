---
title: Sprint 5 handover — 10 followups inherited from Sprint 4
status: READY
opened: 2026-05-18
parent: docs/
related:
  - docs/sprint4-backlog.md
  - docs/sprint4-j5-whatsapp-assessment.md
  - docs/ux/j11.md
---

# Sprint 5 handover

Sprint 4 cerró 23/23 items en un día (PRs #219→#245). Esta es la lista heredada — **10 followups documentados, ninguno bloqueante**. Empieza por aquí para arrancar Sprint 5 desde cero contexto.

## TL;DR — estado actual

- **Master HEAD**: `cb26cc5 docs(sprint4): mark backlog COMPLETE — 23/23 items closed (#245)`
- **Open PRs**: 0
- **Deploy**: nexandro.palafitofood.com (cx43 x86 VPS, auto-reconciler ~5-10 min lag)
- **Backlog source of truth**: [docs/sprint4-backlog.md](sprint4-backlog.md) sección "Followups documented"

## El backlog (10 items)

Ordenados por tamaño + dependencia. Los marcados ⚡ son ≤30 min cada uno; los 🏗️ requieren diseño + migration + tests.

### Grupo A — Backend gaps que el frontend ya espera (stubs activos)

Estos tienen el FE wired contra un stub que lanza; cuando aterrice el backend, **basta con borrar el throw**. Bundle natural en un solo PR.

| # | Item | Scope | Sketch |
|---|---|---|---|
| 1 | **W3-2 per-line GR confirm endpoint** | 🏗️ Backend | `GrConfirmationService.confirm()` hoy hace full-GR. Añadir `confirmLine(grId, lineId, qtyReceived, qtyAccepted, lotCode)` que persiste sólo esa línea + audit row + dispara detector incremental. FE en [apps/web/src/hooks/useProcurement.ts](../apps/web/src/hooks/useProcurement.ts) `useConfirmGrLine` ya postea a `/m3/procurement/gr/:id/lines/:lineId/confirm`. |
| 2 | **W3-3 bulk-confirm backend** | 🏗️ Backend | Mismo root que #1. Endpoint `POST /m3/procurement/gr/bulk-confirm` con body `{ grIds: string[] }`. Acepta tx único o N tx idempotentes — preferible idempotente (un GR puede fallar sin tumbar los demás). FE espera `{ succeeded: string[], failed: { id, reason }[] }`. |
| 3 | **W3-5 `lote-no-conforme` detection rule** | 🏗️ Backend (migration + detector extension) | Falta columna en `goods_receipt_line`. Añadir `qualityStatus enum('ok','conforme','no_conforme') DEFAULT 'ok'`. Migration `0048_gr_line_quality_flag.ts`. Extender [DiscrepancyDetector](../apps/api/src/procurement/reconciliation/application/discrepancy-detector.service.ts) con caso `lote_no_conforme`. Followup ID `m3-gr-lot-quality-flag`. |
| 4 | **W3-6 Owner approval email escalation** | 🏗️ Backend (controller + email template) | Endpoint `POST /m3/procurement/reconciliation/:id/request-owner-approval` falta. Manager hoy ve botón disabled + tooltip. Reusar [EmailService](../apps/api/src/shared/email/) (LogEmailService default). Body sugiere `{ note?: string }`. Audit row `request_owner_approval_requested`. |
| 5 | **W3-11 PO `delivery_location_id` column** | ⚡ Migration | Hoy se guarda como prefijo en `notes` (`[loc:<uuid>] resto del texto`). Migration `0049_po_delivery_location.ts` añade FK nullable a `locations.id`. Backfill leyendo el prefijo de `notes` y stripping. Update PO entity + create/getById serialization. |

**PR shape sugerido**: 1 PR por item; los 5 son independientes. Si quieres optimizar babysit, los #1+#2 comparten servicio → bundlearlos.

### Grupo B — Infra + ops paper-cuts

| # | Item | Scope | Sketch |
|---|---|---|---|
| 6 | **W2-2 SMTP real** | ⚡ Install + config | `npm i nodemailer @types/nodemailer` en `apps/api`. `SmtpEmailService` ya está implementado; sólo falta que el import no tire. Config vars `SMTP_HOST/PORT/USER/PASS/FROM` ya leídas. Verificar el factory en [apps/api/src/shared/email/email.module.ts](../apps/api/src/shared/email/email.module.ts) flippea a SMTP cuando `SMTP_HOST` está set. |
| 7 | **W2-1 AgentChatService runtime BYO key** | 🏗️ Wiring | Credenciales se guardan cifradas (PR #224) pero `AgentChatService` aún usa el server-side OpenAI key. Inyectar `LlmCredentialsService`, resolver por `orgId` al inicio de cada conversación, fallback al server key si la org no tiene una propia. Cuidado: descifrar 1x por sesión y cachear en memoria (no por mensaje). |
| 8 | **W3-13 fake-indexeddb test infra** | ⚡ DevDep + config | `npm i -D fake-indexeddb` en `apps/web`. Importar en `vitest.setup.ts`: `import 'fake-indexeddb/auto'`. Hoy el `offlineQueue` sólo se testea con el in-memory adapter; con fake-indexeddb los specs corren contra la implementación real. |

### Grupo C — Decisiones de scope / spec / externo

| # | Item | Scope | Sketch |
|---|---|---|---|
| 9 | **Spec reconciliation W3-1** | ⚡ Doc | [docs/ux/j11.md](ux/j11.md) dice "Cerrar OC en `parcialmente_recibida`" pero `ADR-PO-STATE-MACHINE` lo prohíbe (sólo desde `enviada` o `recibida`). El drawer ya honra el ADR. Editar j11.md y dejar nota en el ADR de que la spec se alineó (no al revés). |
| 10 | **W4 J5 WhatsApp Meta Business setup** | 🌐 Externo (operador) | NO es trabajo de agente. Pasos en [docs/sprint4-j5-whatsapp-assessment.md](sprint4-j5-whatsapp-assessment.md). Requiere: cuenta Meta Business, número WhatsApp Cloud API verificado, access token permanente, webhook URL whitelisted, var `WHATSAPP_APP_SECRET` en el VPS. Cuando esté hecho, dispara test de webhook desde Meta Console. |

## Sprint 5 shape recomendado

**Opción A — bundle pragmático (1 sesión, ~4-6 PRs)**
- Día 1: #6 (SMTP) + #8 (fake-indexeddb) + #9 (spec doc) → 1 PR cada uno, ≤1h total
- Día 1-2: #5 (lote-no-conforme migration + detector) → 1 PR backend solo
- Día 2: #1 + #2 bundle (per-line + bulk GR confirm) → 1 PR backend; quita `throw stub` en FE en commit aparte
- Día 2-3: #4 (Owner approval endpoint) → 1 PR backend + email template
- Día 3: #7 (AgentChat BYO key) → 1 PR wiring + tests
- Día 3: #11 (PO delivery_location column) → 1 PR migration + serializer

**Opción B — orchestrator paralelo**
- Lanza A1 + A2 + A3 + A4 + A5 (5 worktrees backend, ningún file shared)
- Lanza B1 + B2 + B3 (3 worktrees, todos independientes)
- C9 lo cierras tú a mano (5 min)
- C10 queda esperando a que Master termine el Meta Business setup

⚠️ **NO dispatches A1+A2 en paralelo** — comparten `GrConfirmationService`. Bundlea o secuencia.

## Context a leer si arrancas frío

1. `AGENTS.md` (dispatcher principal del proyecto)
2. [docs/sprint4-backlog.md](sprint4-backlog.md) — qué se hizo + por qué + qué quedó pendiente
3. [docs/ux/j11.md](ux/j11.md) — spec de Procurement (relevante para items 1-5)
4. [docs/sprint4-j5-whatsapp-assessment.md](sprint4-j5-whatsapp-assessment.md) — sólo si vas a tocar item #10
5. ADR-PO-STATE-MACHINE — relevante para items #1, #2, #9
6. [apps/api/src/procurement/reconciliation/](../apps/api/src/procurement/reconciliation/) — el aggregate completo es referencia para añadir el caso `lote_no_conforme`

## Gotchas aprendidos de Sprint 4 (no repetir)

- **Subagentes paralelos SIEMPRE en `isolation: "worktree"`** — sin excepciones. Las 4 silent-deaths de Wave 2 fueron porque corrían en el master checkout.
- **Checkpoint-push después de cada fase** — commit + push tras cada layer; silent-death pierde el ramo si nada está en remoto.
- **Admin-merge bypasses branch-protection** cuando CI verde — `gh pr merge <n> --admin --squash --delete-branch`. Auto-merge no rebasea solo.
- **Rebase conflicts en `useProcurement.ts` / `api/procurement.ts`** son recurrentes cuando 3+ PRs extienden los mismos hooks. Considera bundle o serializa.
- **Subagents NO pueden correr el build local** (worktrees sin node_modules) — espera fixes en CI (~5-10 commits típicos por slice).
- **`git checkout master -- <file>` + reaplicar delta** es el patrón para resolver conflictos cuando el master ya tiene tus cambios + extras.

## Cierre

Cuando termines los 10, este doc se vuelve obsoleto. Borrarlo o marcarlo `status: COMPLETE` igual que se hizo con `sprint4-backlog.md`.
