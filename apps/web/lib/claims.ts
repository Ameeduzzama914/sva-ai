const VAGUE_PATTERNS = [
  /^hi\b/i,
  /^hello\b/i,
  /^hey\b/i,
  /^thanks?\b/i,
  /^in conclusion\b/i,
  /^overall\b/i,
  /^i think\b/i,
  /^i believe\b/i,
  /^it seems\b/i,
  /^probably\b/i,
  /^maybe\b/i
];

const normalizeClaim = (claim: string): string =>
  claim
    .toLowerCase()
    .replace(/[^a-z0-9\s%-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isLikelyFactualClaim = (claim: string): boolean => {
  if (!claim || claim.length < 12) {
    return false;
  }

  const normalized = normalizeClaim(claim);
  if (!normalized) {
    return false;
  }

  if (VAGUE_PATTERNS.some((pattern) => pattern.test(claim))) {
    return false;
  }

  const tokens = normalized.split(" ").filter((token) => token.length > 1);
  if (tokens.length < 4) {
    return false;
  }

  const hasNumber = /\d/.test(normalized);
  const hasFactVerb = /\b(is|are|was|were|has|have|includes|contains|located|measures|equals)\b/i.test(claim);
  return hasNumber || hasFactVerb;
};

export const extractClaims = (text: string): string[] => {
  const segments = text
    .split(/\n|[•*-]\s+|(?<=[.!?;])\s+/g)
    .map((segment) => segment.trim())
    .map((segment) => segment.replace(/^[\d.)\s-]+/, "").trim())
    .filter((segment) => segment.length > 0);

  const unique = new Set<string>();
  const claims: string[] = [];

  segments.forEach((segment) => {
    const claim = segment.replace(/\s+/g, " ").trim();
    if (!isLikelyFactualClaim(claim)) {
      return;
    }

    const key = normalizeClaim(claim);
    if (unique.has(key)) {
      return;
    }

    unique.add(key);
    claims.push(claim.endsWith(".") ? claim : `${claim}.`);
  });

  return claims;
};
