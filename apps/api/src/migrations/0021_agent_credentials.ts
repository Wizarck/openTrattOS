import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M2 Wave 1.13 [3c] — m2-mcp-agent-registry-bench: per-org agent credential
 * registry. Holds the Ed25519 public key for each registered agent so the
 * `AgentSignatureMiddleware` can verify `X-Agent-Signature` headers without
 * a cross-call to a user-management service.
 *
 * Per ADR-AGENT-CRED-1 (design.md): one row per (organizationId, agentName).
 * Soft-delete via `revoked_at`; rows persist after revocation so audit
 * queries can still resolve historical agentName → public_key bindings.
 */
export class AgentCredentials1700000021000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "agent_credentials" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id"  uuid        NOT NULL REFERENCES "organizations"("id"),
        "agent_name"       varchar(64) NOT NULL,
        "public_key"       text        NOT NULL,
        "role"             varchar(32) NOT NULL,
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        "revoked_at"       timestamptz NULL,
        CONSTRAINT "agent_credentials_role_check"
          CHECK ("role" IN ('OWNER', 'MANAGER', 'STAFF')),
        CONSTRAINT "agent_credentials_agent_name_length_check"
          CHECK (char_length("agent_name") BETWEEN 1 AND 64),
        CONSTRAINT "agent_credentials_public_key_length_check"
          CHECK (char_length("public_key") BETWEEN 1 AND 4096)
      )
    `);

    // (organization_id, agent_name) unique — one credential row per agent
    // per org. Revoked rows still occupy the slot so re-registration with
    // the same name 409s; operators must DELETE a revoked row before
    // re-creating with the same name.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_agent_credentials_org_agent_name"
      ON "agent_credentials" ("organization_id", "agent_name")
    `);

    // Lookup index for the signature middleware: id → row.
    // (Primary key already covers this; no extra index needed.)

    // List queries are scoped per-org and filter active rows; an index on
    // organization_id alone is sufficient (the partial index on revoked_at
    // would optimise the "list active only" path but the org sizes don't
    // justify it yet).
    await queryRunner.query(`
      CREATE INDEX "ix_agent_credentials_organization_id"
      ON "agent_credentials" ("organization_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_agent_credentials_organization_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_agent_credentials_org_agent_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_credentials"`);
  }
}
