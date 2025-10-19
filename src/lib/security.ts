const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const hex: string[] = [];
  for (const byte of bytes) {
    hex.push(byte.toString(16).padStart(2, '0'));
  }
  return hex.join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex input');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export async function hmacSha256(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return toHex(signature);
}

export function timingSafeEqualHex(expected: string, actual: string): boolean {
  try {
    const expectedBytes = hexToBytes(expected);
    const actualBytes = hexToBytes(actual);
    let diff = expectedBytes.length ^ actualBytes.length;
    const minLength = Math.min(expectedBytes.length, actualBytes.length);
    for (let i = 0; i < minLength; i++) {
      diff |= expectedBytes[i] ^ actualBytes[i];
    }
    return diff === 0 && expectedBytes.length === actualBytes.length;
  } catch (error) {
    console.error('Failed to compare hex values', error);
    return false;
  }
}

export function generateNumericCode(length: number): string {
  if (length <= 0) {
    throw new Error('OTP length must be positive');
  }
  const max = 10 ** length;
  const randomBytes = new Uint32Array(1);
  const upperBound = Math.floor((0xffffffff / max)) * max;
  let value = 0;
  do {
    crypto.getRandomValues(randomBytes);
    value = randomBytes[0];
  } while (value >= upperBound);
  const code = value % max;
  return code.toString().padStart(length, '0');
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export interface SessionSecret {
  sessionId: string;
  token: string;
}

export function generateSessionSecret(): SessionSecret {
  const sessionId = crypto.randomUUID();
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = base64UrlEncode(tokenBytes);
  return { sessionId, token };
}

export const ADMIN_SESSION_COOKIE = 'fw_admin_session';

export function buildSessionCookieValue(secret: SessionSecret): string {
  return `${secret.sessionId}.${secret.token}`;
}

export function parseSessionCookie(value: string | undefined | null):
  | { sessionId: string; token: string }
  | null {
  if (!value) return null;
  const [sessionId, token] = value.split('.', 2);
  if (!sessionId || !token) {
    return null;
  }
  return { sessionId, token };
}
