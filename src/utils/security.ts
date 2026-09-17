/**
 * Security & Cryptography Utilities for SIMPEL
 * Provides SHA-256 hashing for credentials (Admin PIN, Teacher/Student Passwords)
 * and data sanitization routines to prevent leaking passwords to client components.
 */

const PIN_SALT = 'simpel_pin_salt_2026';
const TEACHER_SALT = 'simpel_teacher_salt_2026';
const STUDENT_SALT = 'simpel_student_salt_2026';

/**
 * Hashes a string using standard browser Web Crypto API (SHA-256).
 */
export async function hashCredential(input: string, salt: string = PIN_SALT): Promise<string> {
  const cleanInput = (input || '').trim();
  if (!cleanInput) return '';

  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const enc = new TextEncoder();
      const data = enc.encode(`${salt}:${cleanInput}`);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (err) {
    console.warn('Web Crypto subtle digest failed, using fallback:', err);
  }

  // Fallback hash implementation if Web Crypto is unavailable
  let hash = 0;
  const str = `${salt}:${cleanInput}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `h_${Math.abs(hash).toString(16)}`;
}

/**
 * Verifies if user input matches either a stored hash or a legacy plaintext credential.
 * Supports string/number credentials, case-insensitivity, default password fallbacks,
 * and salt variations to guarantee valid logins never fail.
 */
export async function verifyCredential(
  input: any,
  storedHashOrPlain?: any,
  salt: string = PIN_SALT
): Promise<boolean> {
  const cleanInput = input !== undefined && input !== null ? String(input).trim() : '';
  if (!cleanInput) return false;

  // If no password is set in the database, allow the standard default password 'pass123' or '12345'
  if (storedHashOrPlain === undefined || storedHashOrPlain === null || String(storedHashOrPlain).trim() === '') {
    return cleanInput === 'pass123' || cleanInput === '12345';
  }

  const cleanStored = String(storedHashOrPlain).trim();

  // 1. Direct exact match (plaintext)
  if (cleanInput === cleanStored) {
    return true;
  }

  // 1b. Direct match case-insensitive (e.g. Pass123 vs pass123)
  if (cleanInput.toLowerCase() === cleanStored.toLowerCase()) {
    return true;
  }

  // 2. Hash match with specified salt
  const hashedInput = await hashCredential(cleanInput, salt);
  if (hashedInput === cleanStored) {
    return true;
  }

  // 3. Fallback salts (STUDENT_SALT, PIN_SALT, TEACHER_SALT)
  const allSalts = [STUDENT_SALT, PIN_SALT, TEACHER_SALT];
  for (const s of allSalts) {
    if (s !== salt) {
      const altHash = await hashCredential(cleanInput, s);
      if (altHash === cleanStored) return true;
    }
  }

  // 4. Raw unsalted SHA-256 hash check if legacy hash was created without salt
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const enc = new TextEncoder();
      const rawData = enc.encode(cleanInput);
      const rawBuffer = await window.crypto.subtle.digest('SHA-256', rawData);
      const rawHex = Array.from(new Uint8Array(rawBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
      if (rawHex === cleanStored) return true;
    }
  } catch {}

  // 5. Fallback for standard default password
  if (cleanInput === 'pass123' && (cleanStored === 'pass123' || !cleanStored)) {
    return true;
  }

  return false;
}

/**
 * Removes sensitive fields (like plain password) from teacher account before public rendering
 */
export function sanitizeTeacherForPublic<T extends { password?: string }>(teacher: T): Omit<T, 'password'> {
  if (!teacher) return teacher;
  const { password, ...safe } = teacher;
  return safe as Omit<T, 'password'>;
}

/**
 * Removes sensitive fields (like plain password) from student account before public rendering
 */
export function sanitizeStudentForPublic<T extends { password?: string }>(student: T): Omit<T, 'password'> {
  if (!student) return student;
  const { password, ...safe } = student;
  return safe as Omit<T, 'password'>;
}

export { PIN_SALT, TEACHER_SALT, STUDENT_SALT };
