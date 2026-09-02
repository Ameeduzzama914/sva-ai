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

const ANSWER_CLAIM_LIMIT = 8;
const ANSWER_META_PATTERN = /\b(source quality|evidence strength|evidence summary|retrieval mode|credibility|trust score|confidence assessment|final confidence|agreement|contradiction penalty|provider status|live coverage|why sva chose|areas? with sparse|lower-authority evidence|reduce certainty|reliability commentary)\b/i;
const URL_OR_DOMAIN_PATTERN = /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|org|net|gov|edu|io|ai|co|in)\b)/i;
const FACTUAL_PREDICATE = /\b(is|are|was|were|has|have|became|becomes|contains|includes|located|measures|equals|causes|caused|reduces|reduced|increases|increased|decreases|decreased|prevents|prevented|supports|supported|founded|established|serves|served)\b/i;
const ANSWER_STOPWORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "in", "is", "it", "of", "on", "that", "the", "to", "was", "were", "with"]);

const answerSimilarityTokens = (claim: string): string[] =>
  normalizeClaim(claim)
    .split(" ")
    .filter((token) => token.length > 2 && !ANSWER_STOPWORDS.has(token));

const isAnswerClaim = (claim: string): boolean => {
  if (claim.length < 12 || claim.length > 360) return false;
  if (ANSWER_META_PATTERN.test(claim) || URL_OR_DOMAIN_PATTERN.test(claim)) return false;
  if (/^[-#*\d.)\s]*(quick verdict|scientific consensus|important caveats|contradictions?|evidence|sources?|claims?)\s*:?$/i.test(claim)) return false;
  if (/\b\d{1,3}\s*%\b/.test(claim) && /\b(credibility|confidence|quality|agreement|evidence|score)\b/i.test(claim)) return false;
  const words = normalizeClaim(claim).split(" ").filter(Boolean);
  return words.length >= 4 && FACTUAL_PREDICATE.test(claim);
};

const inferAnswerContext = (sentence: string): { subject?: string; scope?: string } => {
  const invertedCapital = sentence.match(/^(?:the\s+)?capital\s+of\s+(.+?)\s+is\s+(.+?)[.!?]?$/i);
  if (invertedCapital) return { subject: invertedCapital[2].trim(), scope: invertedCapital[1].trim() };
  const directCapital = sentence.match(/^(.+?)\s+is\s+(?:the\s+)?capital\s+of\s+(.+?)[.!?]?$/i);
  if (directCapital) return { subject: directCapital[1].trim(), scope: directCapital[2].trim() };
  return {};
};

const splitAnswerClaim = (sentence: string, priorSubject?: string, priorScope?: string): { claims: string[]; subject?: string; scope?: string } => {
  const cleaned = sentence.replace(/^[\s#>*\d.)-]+/, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return { claims: [], subject: priorSubject, scope: priorScope };

  const inferred = inferAnswerContext(cleaned);
  const subject = inferred.subject ?? priorSubject;
  const scope = inferred.scope ?? priorScope;
  const canonicalCapital = inferred.subject && inferred.scope ? `${inferred.subject} is the capital of ${inferred.scope}` : cleaned;
  const resolved = canonicalCapital.replace(/^(It|This city|The city)\s+/i, subject ? `${subject} ` : "$&");
  const compound = resolved.match(/^(.+?)\s+(is|are|was|were)\s+(.+?)\s+and\s+(.+?)[.!?]?$/i);
  if (!compound) return { claims: [resolved], subject: inferred.subject ?? resolved.match(/^(.+?)\s+(?:is|are|was|were)\b/i)?.[1]?.trim() ?? subject, scope };

  const [, compoundSubject, verb, leftPredicate, rightPredicate] = compound;
  const rightScope = rightPredicate.match(/\b(of|in)\s+(.+?)$/i);
  const rightScopeValue = rightScope?.[2]?.replace(/[.!?]+$/, "").trim();
  const rightHasGenericScope = Boolean(rightScopeValue && /^(?:a|an|the)\s+(?:sovereign\s+)?state\b/i.test(rightScopeValue));
  const sharedScope = rightHasGenericScope ? scope : rightScopeValue ?? scope;
  const leftNeedsScope = /\b(capital|largest city)\b/i.test(leftPredicate) && !/\b(of|in)\b/i.test(leftPredicate);
  const withArticle = (predicate: string): string => /^(largest|smallest|northernmost|southernmost|oldest|newest)\b/i.test(predicate) ? `the ${predicate}` : predicate;
  const left = `${compoundSubject} ${verb} ${withArticle(leftPredicate)}${leftNeedsScope && sharedScope ? ` of ${sharedScope}` : ""}`;
  const right = `${compoundSubject} ${verb} ${withArticle(rightPredicate)}`;
  return { claims: [left, right], subject: compoundSubject.trim(), scope: sharedScope ?? scope };
};

export const extractAnswerClaims = (text: string, limit = ANSWER_CLAIM_LIMIT): string[] => {
  const sentences = text
    .split(/\n+|(?<=[.!?;])\s+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const candidates: string[] = [];
  let subject: string | undefined;
  let scope: string | undefined;

  for (const sentence of sentences) {
    const atomic = splitAnswerClaim(sentence, subject, scope);
    subject = atomic.subject ?? subject;
    scope = atomic.scope ?? scope;
    candidates.push(...atomic.claims);
  }

  const accepted: string[] = [];
  const acceptedTokens: string[][] = [];
  for (const candidate of candidates) {
    const claim = candidate.replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim();
    if (!isAnswerClaim(claim)) continue;
    const tokens = answerSimilarityTokens(claim);
    if (acceptedTokens.some((existing) => tokenOverlap(existing, tokens) >= 0.72)) continue;
    accepted.push(`${claim}.`);
    acceptedTokens.push(tokens);
    if (accepted.length >= Math.max(1, limit)) break;
  }
  return accepted;
};

export interface ExtractedClaim { claim: string; confidence: number; }

export const extractClaimsWithConfidence = (text: string): ExtractedClaim[] =>
  extractClaims(text).map((claim) => ({ claim, confidence: /\d/.test(claim) || CLAIM_CUES.test(claim) ? 0.9 : 0.78 }));
