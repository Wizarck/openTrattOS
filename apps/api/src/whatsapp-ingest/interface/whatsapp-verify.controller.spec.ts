import type { Response } from 'express';
import { WhatsappVerifyController } from './whatsapp-verify.controller';

function buildRes(): {
  res: Response;
  status: jest.Mock;
  send: jest.Mock;
  type: jest.Mock;
} {
  const send = jest.fn();
  const type = jest.fn(() => ({ send }));
  const status = jest.fn(() => ({ send, type }));
  const res = { status, send, type } as unknown as Response;
  // Wire .type to also call status's chain by default.
  return { res, status, send, type };
}

describe('WhatsappVerifyController', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, WHATSAPP_VERIFY_TOKEN: 'secret-token' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('echoes hub.challenge when mode + token match', () => {
    const controller = new WhatsappVerifyController();
    const { res, status, type, send } = buildRes();
    controller.verify('subscribe', 'random-challenge-123', 'secret-token', res);
    expect(status).toHaveBeenCalledWith(200);
    expect(type).toHaveBeenCalledWith('text/plain');
    expect(send).toHaveBeenCalledWith('random-challenge-123');
  });

  it('rejects when mode is not "subscribe"', () => {
    const controller = new WhatsappVerifyController();
    const { res, status, send } = buildRes();
    controller.verify('unsubscribe', 'random-challenge', 'secret-token', res);
    expect(status).toHaveBeenCalledWith(403);
    expect(send).toHaveBeenCalledWith('forbidden');
  });

  it('rejects when verify_token mismatches', () => {
    const controller = new WhatsappVerifyController();
    const { res, status, send } = buildRes();
    controller.verify('subscribe', 'random-challenge', 'wrong-token', res);
    expect(status).toHaveBeenCalledWith(403);
    expect(send).toHaveBeenCalledWith('forbidden');
  });

  it('rejects when WHATSAPP_VERIFY_TOKEN env is unset (fail-closed)', () => {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    const controller = new WhatsappVerifyController();
    const { res, status, send } = buildRes();
    controller.verify('subscribe', 'random-challenge', 'anything', res);
    expect(status).toHaveBeenCalledWith(403);
    expect(send).toHaveBeenCalledWith('forbidden');
  });

  it('400s when challenge is missing', () => {
    const controller = new WhatsappVerifyController();
    const { res, status, send } = buildRes();
    controller.verify('subscribe', undefined, 'secret-token', res);
    expect(status).toHaveBeenCalledWith(400);
    expect(send).toHaveBeenCalledWith('missing challenge');
  });
});
