import { describe, it, expect } from 'vitest';
import { signAuthToken, verifyAuthToken } from './token';

describe('auth token', () => {
  it('produces a deterministic hex token that is not the raw pin', async () => {
    const token = await signAuthToken('1234');

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).not.toContain('1234');
    expect(await signAuthToken('1234')).toBe(token);
  });

  it('verifies a token signed with the same pin', async () => {
    const token = await signAuthToken('1234');

    expect(await verifyAuthToken(token, '1234')).toBe(true);
  });

  it('rejects a token signed with a different pin', async () => {
    const token = await signAuthToken('1234');

    expect(await verifyAuthToken(token, '9999')).toBe(false);
  });

  it('rejects a tampered token', async () => {
    const token = await signAuthToken('1234');
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;

    expect(await verifyAuthToken(tampered, '1234')).toBe(false);
  });

  it('rejects the old static sentinel value', async () => {
    expect(await verifyAuthToken('ok', '1234')).toBe(false);
  });

  it('rejects empty tokens or missing pins', async () => {
    expect(await verifyAuthToken('', '1234')).toBe(false);
    expect(await verifyAuthToken(await signAuthToken('1234'), '')).toBe(false);
  });
});
