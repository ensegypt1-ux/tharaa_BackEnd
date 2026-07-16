import { normalizeFcmPrivateKey } from './firebase-admin.config';

describe('normalizeFcmPrivateKey', () => {
  it('converts escaped newlines', () => {
    const key = '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n';
    expect(normalizeFcmPrivateKey(key)).toBe(
      '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n',
    );
  });

  it('strips wrapping quotes', () => {
    const key = '"-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n"';
    expect(normalizeFcmPrivateKey(key)).toContain('BEGIN PRIVATE KEY');
    expect(normalizeFcmPrivateKey(key)).not.toContain('\\n');
  });

  it('returns empty for blank input', () => {
    expect(normalizeFcmPrivateKey('')).toBe('');
    expect(normalizeFcmPrivateKey('   ')).toBe('');
  });
});
