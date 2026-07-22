// Mirrors backend/src/validation/schemas.ts strongPasswordSchema — kept in sync manually since
// the frontend has no access to the Zod schema. Used for client creation and password reset,
// never for login (login only checks a password already accepted under whatever rules were
// active when it was set).
export interface PasswordRule {
  key: string;
  label: string;
  test: (pw: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { key: 'length', label: 'Au moins 10 caractères', test: (pw) => pw.length >= 10 },
  { key: 'lower', label: 'Une lettre minuscule', test: (pw) => /[a-z]/.test(pw) },
  { key: 'upper', label: 'Une lettre majuscule', test: (pw) => /[A-Z]/.test(pw) },
  { key: 'digit', label: 'Un chiffre', test: (pw) => /[0-9]/.test(pw) },
  { key: 'special', label: 'Un caractère spécial', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function isPasswordValid(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw));
}
