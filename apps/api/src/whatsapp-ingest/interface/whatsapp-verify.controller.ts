import { Controller, Get, HttpCode, HttpStatus, Logger, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

/**
 * Meta's WhatsApp Cloud API webhook verification handshake.
 *
 * Flow:
 *  1. Operator configures the callback URL in Meta's app dashboard:
 *     `https://nexandro.palafitofood.com/api/webhooks/whatsapp`.
 *  2. Operator sets a `Verify Token` in the same dashboard form. The
 *     same string MUST be set in `WHATSAPP_VERIFY_TOKEN` here.
 *  3. Meta hits `GET /api/webhooks/whatsapp?hub.mode=subscribe&
 *     hub.challenge=<random>&hub.verify_token=<the token>`.
 *  4. We echo `hub.challenge` as plain text with `200 OK` IFF
 *     `hub.verify_token` matches our env. Otherwise we 403.
 *
 * Per Meta's docs the response body MUST be the challenge string
 * verbatim (no JSON wrapping, no quotes). The controller therefore
 * writes the response manually via `res.send(challenge)`.
 *
 * **Scope honesty**: this endpoint exists only to satisfy the Meta
 * handshake. Without the operator-side dashboard setup (assessment
 * doc §2) Meta will never call this endpoint and webhooks will not
 * deliver. The handshake is the *third* thing the operator does, after
 * (a) creating the WhatsApp Business app and (b) registering the
 * phone number.
 */
@ApiTags('WhatsApp Webhook')
@Controller('webhooks/whatsapp')
export class WhatsappVerifyController {
  private readonly logger = new Logger(WhatsappVerifyController.name);

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Meta webhook verification handshake (returns hub.challenge).',
  })
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Res() res: Response,
  ): void {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? '';
    if (mode !== 'subscribe') {
      this.logger.warn(
        `whatsapp-verify.rejected mode=${mode ?? '<missing>'} (expected 'subscribe')`,
      );
      res.status(HttpStatus.FORBIDDEN).send('forbidden');
      return;
    }
    if (!expected) {
      this.logger.error(
        'whatsapp-verify.misconfigured WHATSAPP_VERIFY_TOKEN env is empty — handshake will always fail',
      );
      res.status(HttpStatus.FORBIDDEN).send('forbidden');
      return;
    }
    if (verifyToken !== expected) {
      this.logger.warn('whatsapp-verify.rejected verify_token mismatch');
      res.status(HttpStatus.FORBIDDEN).send('forbidden');
      return;
    }
    if (challenge === undefined) {
      this.logger.warn('whatsapp-verify.rejected missing hub.challenge');
      res.status(HttpStatus.BAD_REQUEST).send('missing challenge');
      return;
    }
    // Meta requires the plain challenge string echoed back verbatim.
    res.status(HttpStatus.OK).type('text/plain').send(challenge);
  }
}
