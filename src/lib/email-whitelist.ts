export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedEmail(
  candidateEmail: string | null | undefined,
  allowedEmail: string | null | undefined,
): boolean {
  if (!candidateEmail || !allowedEmail) {
    return false;
  }

  const normalizedCandidate = normalizeEmail(candidateEmail);
  const normalizedAllowed = normalizeEmail(allowedEmail);

  if (!normalizedCandidate || !normalizedAllowed) {
    return false;
  }

  return normalizedCandidate === normalizedAllowed;
}
