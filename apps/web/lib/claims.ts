
const META_PATTERNS = [
  /quick verdict/i,
  /final confidence/i,
  /confidence assessment/i,
  /consensus summary/i,
  /why sva chose/i,
  /important caveats/i,
  /evidence summary/i,
  /^verdict[:\s]/i,
  /^confidence[:\s]/i
];

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

  if (VAGUE_PATTERNS.some((pattern) => pattern.test(claim)) || META_PATTERNS.some((pattern)=>pattern.test(claim))) {
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
  const keys: string[][] = [];

  segments.forEach((segment) => {
    const claim = segment.replace(/\s+/g, " ").trim();
    if (!isLikelyFactualClaim(claim)) {
      return;
    }

    const key = normalizeClaim(claim);
    if (unique.has(key)) {
      return;
    }

    const thisTokens = similarityKey(claim);
    if (keys.some((k) => tokenOverlap(k, thisTokens) >= 0.78)) {
      return;
    }
    unique.add(key);
    keys.push(thisTokens);
    if (/source|credibility|http|www\./i.test(claim)) return;
    claims.push(claim.endsWith(".") ? claim : `${claim}.`);
  });

  return claims.slice(0, 8);
};

export interface ExtractedClaim {
  claim: string;
  confidence: number;
}

export const extractClaimsWithConfidence = (text: string): ExtractedClaim[] =>
  extractClaims(text).map((claim) => ({
    claim,
    confidence: /\d/.test(claim) ? 0.92 : 0.8
  }));


const similarityKey = (claim: string): string[] => normalizeClaim(claim).split(" ").filter((t) => t.length > 3);
const tokenOverlap = (a: string[], b: string[]): number => { const A=new Set(a); const B=new Set(b); const inter=[...A].filter(x=>B.has(x)).length; const denom=Math.max(1,new Set([...A,...B]).size); return inter/denom; };
