const META_PATTERNS = [/quick verdict/i,/final confidence/i,/confidence assessment/i,/consensus summary/i,/why sva chose/i,/important caveats/i,/evidence summary/i,/core conclusion/i,/scientific consensus summary/i,/^verdict[:\s]/i,/^confidence[:\s]/i];
const VAGUE_PATTERNS = [/^hi\b/i,/^hello\b/i,/^hey\b/i,/^thanks?\b/i,/^in conclusion\b/i,/^overall\b/i,/^i think\b/i,/^i believe\b/i,/^it seems\b/i,/^probably\b/i,/^maybe\b/i];
const CLAIM_CUES = /\b(reduces?|improves?|increases?|decreases?|prevents?|causes?|risk|safe|safety|effective|effectiveness|recommended|guideline|consensus|evidence|study|trial|meta-analysis|systematic review|side effect|adverse|timeline|within|after|before|year|month|week)\b/i;
const FILLER_CLAIMS = /\b(moderation is key|the evidence suggests|individual responses vary|overall|experts believe|more research is needed)\b/i;

const normalizeClaim = (claim: string): string => claim.toLowerCase().replace(/[^a-z0-9\s%-]/g, " ").replace(/\s+/g, " ").trim();
const similarityKey = (claim: string): string[] => normalizeClaim(claim).split(" ").filter((t) => t.length > 3);
const tokenOverlap = (a: string[], b: string[]): number => { const A=new Set(a); const B=new Set(b); const inter=[...A].filter(x=>B.has(x)).length; const denom=Math.max(1,new Set([...A,...B]).size); return inter/denom; };

const isLikelyFactualClaim = (claim: string): boolean => {
  if (!claim || claim.length < 24) return false;
  const normalized = normalizeClaim(claim);
  if (!normalized) return false;
  if (VAGUE_PATTERNS.some((pattern) => pattern.test(claim)) || META_PATTERNS.some((pattern)=>pattern.test(claim)) || FILLER_CLAIMS.test(claim)) return false;
  const tokens = normalized.split(" ").filter((token) => token.length > 1);
  if (tokens.length < 8) return false;
  const hasNumber = /\d/.test(normalized);
  const hasFactVerb = /\b(is|are|was|were|has|have|includes|contains|located|measures|equals|can|cannot|should|recommended)\b/i.test(claim);
  return hasNumber || hasFactVerb || CLAIM_CUES.test(claim);
};

const toAtomicUnits = (text: string): string[] => {
  const base = text
    .split(/\n|[•*-]\s+|(?<=[.!?;])\s+/g)
    .map((segment) => segment.trim())
    .map((segment) => segment.replace(/^[\d.)\s-]+/, "").trim())
    .filter(Boolean);

  const splitters = /\b(and|but|while|however|although|whereas|because|therefore|which|that)\b/i;
  return base.flatMap((seg) => {
    const chunks = seg.split(/,(?=\s*[a-zA-Z])|\s+-\s+|:\s+/g).map((s) => s.trim()).filter(Boolean);
    return chunks.flatMap((chunk) => chunk.split(splitters).map((s) => s.trim()).filter((s) => s.length >= 10 && /[a-z]/i.test(s)));
  });
};

export const extractClaims = (text: string): string[] => {
  const segments = toAtomicUnits(text);
  const unique = new Set<string>();
  const claims: string[] = [];
  const keys: string[][] = [];

  segments.forEach((segment) => {
    const claim = segment.replace(/\s+/g, " ").trim();
    if (!isLikelyFactualClaim(claim)) return;
    if (/source|credibility|http|www\./i.test(claim)) return;

    const key = normalizeClaim(claim);
    if (unique.has(key)) return;
    const thisTokens = similarityKey(claim);
    if (keys.some((k) => tokenOverlap(k, thisTokens) >= 0.66)) return;

    unique.add(key); keys.push(thisTokens);
    claims.push(claim.endsWith(".") ? claim : `${claim}.`);
  });

  return claims.slice(0, 20);
};

export interface ExtractedClaim { claim: string; confidence: number; }

export const extractClaimsWithConfidence = (text: string): ExtractedClaim[] =>
  extractClaims(text).map((claim) => ({ claim, confidence: /\d/.test(claim) || CLAIM_CUES.test(claim) ? 0.9 : 0.78 }));
