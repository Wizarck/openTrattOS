import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '../../../iam/domain/user.entity';

const ROLE_VALUES: UserRole[] = ['OWNER', 'MANAGER', 'STAFF'];

export class CreateAgentCredentialDto {
  /**
   * Human-readable id used as audit attribution. Unique per organization.
   * Conventional values: `hermes`, `claude-desktop-<owner>`, `opencode-<env>`.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  agentName!: string;

  /**
   * Base64-encoded SPKI / DER form of the Ed25519 public key. Generate with
   *   node -e "const {generateKeyPairSync} = require('crypto');
   *            const {publicKey} = generateKeyPairSync('ed25519');
   *            console.log(publicKey.export({type:'spki', format:'der'}).toString('base64'));"
   * (See `docs/operations/m2-mcp-agent-registry-bench-runbook.md`.)
   */
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  publicKey!: string;

  /**
   * Role inherited by requests signed with this credential. The agent
   * acts AS itself with this role's permissions; it does NOT impersonate
   * an end user (per ADR-AGENT-CRED-1).
   */
  @IsString()
  @IsIn(ROLE_VALUES)
  role!: UserRole;
}

/**
 * Response shape — public key is intentionally NOT echoed back. Operators
 * who lose track of which public key was registered must inspect the row
 * directly via psql; the API surface treats public keys as write-only.
 */
export interface AgentCredentialResponse {
  id: string;
  agentName: string;
  role: UserRole;
  createdAt: string;
  revokedAt: string | null;
}
