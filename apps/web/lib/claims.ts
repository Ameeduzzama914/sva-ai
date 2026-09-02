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
const ANSWER_META_PATTERN = /\b(source quality|evidence strength|evidence summary|retrieval mode|credibility|trust score|confidence assessment|final confidence|agreement|contradiction penalty|provider status|live coverage|why sva chose|areas? with sparse|lower-authority evidence|reduce certainty|reliability commentary|in summary)\b/i;
const URL_OR_DOMAIN_PATTERN = /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|org|net|gov|edu|io|ai|co|in)\b)/i;
const FACTUAL_PREDICATE = /\b(is|are|was|were|has|have|had|can|may|might|could|will|would|does|do|did|became|becomes|contains|includes|located|measures|equals|causes|caused|reduces|reduced|increases|increased|decreases|decreased|prevents|prevented|supports|supported|founded|established|serves|served|produces|depends|relies|rely|requires|required|uses|used|operates|operated|launched|won|grew|fell|sells|sold|costs|cost|remains|remain)\b/i;
const ANSWER_STOPWORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "in", "is", "it", "of", "on", "that", "the", "to", "was", "were", "with"]);
const VERIFICATION_STATUS = "(?:partially\\s+verified|mixed\\s+evidence|not\\s+verified|verified|unsupported|supported|disputed|inconclusive|unverified)";
const VERIFICATION_STATUS_SUFFIX = new RegExp(`\\s*(?::|[-\\u2013\\u2014])\\s*${VERIFICATION_STATUS}\\s*$`, "i");
const VERIFICATION_STATUS_PREFIX = new RegExp(`^\\s*${VERIFICATION_STATUS}\\s*:\\s*`, "i");
const STANDALONE_VERIFICATION_STATUS = new RegExp(`^\\s*${VERIFICATION_STATUS}\\s*$`, "i");
const UNSAFE_SUBORDINATE_START = /^(?:making|causing|resulting|leading|leaving|allowing|requiring|depending)\b/i;

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

const MODAL_OR_AUXILIARY = "(?:can|may|might|could|should|must|will|would|does|do|did)";
const LEXICAL_PREDICATE = "(?:is|are|was|were|has|have|had|became|becomes|contains|includes|measures|equals|causes|caused|reduces|reduced|increases|increased|decreases|decreased|prevents|prevented|supports|supported|serves|served|produces|depends|relies|rely|requires|required|uses|used|operates|operated|launched|won|grew|fell|sells|sold|costs|cost|remains|remain)";
const PREDICATE_START = new RegExp(`^(?:${MODAL_OR_AUXILIARY}\\s+(?:not\\s+)?[a-z]+|${LEXICAL_PREDICATE})\\b`, "i");
const SUBJECT_PREDICATE = new RegExp(`^(.+?)\\s+((?:${MODAL_OR_AUXILIARY}\\s+(?:not\\s+)?[a-z]+|${LEXICAL_PREDICATE})\\b.*)$`, "i");
const SHARED_TIME_SUFFIX = /\b(?:in|during|throughout|by|as of)\s+(?:19|20)\d{2}\s*$/i;
const PARTICIPIAL_START = /^(located|based|born|founded|established|launched|situated|known|used)\b/i;

const parseSubjectPredicate = (clause: string): { subject: string; predicate: string } | undefined => {
  const match = clause.trim().match(SUBJECT_PREDICATE);
  if (!match) return undefined;
  return { subject: match[1].trim(), predicate: match[2].trim() };
};

const withTerminalPunctuation = (claim: string): string => `${claim.replace(/[.!?]+$/, "").trim()}.`;

const stripVerificationCommentary = (sentence: string): string => {
  const withoutSummaryLead = sentence.replace(/^\s*in summary\s*[:,]\s*/i, "");
  if (STANDALONE_VERIFICATION_STATUS.test(withoutSummaryLead.replace(/[.!?]+$/, ""))) return "";
  return withoutSummaryLead.replace(/[.!?]+$/, "").replace(VERIFICATION_STATUS_SUFFIX, "").replace(VERIFICATION_STATUS_PREFIX, "").trim();
};

const splitCoordinatedPredicates = (sentence: string, forcedSubject?: string): { claims: string[]; subject?: string } => {
  const chunks = sentence.split(/\s+(?:and|but)\s+/i).map((chunk) => chunk.trim()).filter(Boolean);
  const first = parseSubjectPredicate(chunks[0]);
  if (!first || chunks.length === 1) return { claims: [sentence], subject: first?.subject ?? forcedSubject };

  const subject = forcedSubject ?? first.subject;
  const sharedTime = sentence.match(SHARED_TIME_SUFFIX)?.[0];
  const copula = first.predicate.match(/^(is|are|was|were)\b/i)?.[1];
  const finalScope = chunks.at(-1)?.match(/\b(of|in)\s+((?!a\b|an\b).+)$/i);
  const claims = [`${subject} ${first.predicate}`];

  for (const chunk of chunks.slice(1)) {
    const withoutSharedTime = sharedTime ? chunk.replace(new RegExp(`\\s+${sharedTime.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), "") : chunk;
    if (PREDICATE_START.test(withoutSharedTime)) {
      claims.push(`${subject} ${withoutSharedTime}`);
      continue;
    }
    const explicit = parseSubjectPredicate(withoutSharedTime);
    if (explicit) {
      claims.push(`${explicit.subject} ${explicit.predicate}`);
      continue;
    }
    if (copula) {
      const article = /^(?:largest|smallest|northernmost|southernmost|oldest|newest|highest|lowest)\b/i.test(chunk) ? "the " : "";
      claims.push(`${subject} ${copula} ${article}${chunk}`);
      continue;
    }
    claims[claims.length - 1] += ` and ${chunk}`;
  }

  if (copula && finalScope && claims.length > 1) {
    const scopeText = `${finalScope[1]} ${finalScope[2]}`;
    claims[0] = new RegExp(`\\b(?:of|in)\\s+${finalScope[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i").test(claims[0]) ? claims[0] : `${claims[0]} ${scopeText}`;
  }
  if (sharedTime && claims.length > 1) {
    return { claims: claims.map((claim) => new RegExp(`\\b${sharedTime.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i").test(claim) ? claim : `${claim} ${sharedTime}`), subject };
  }
  return { claims, subject };
};

const invertRelationalCopula = (clause: string): { claim: string; subject?: string; scope?: string } => {
  const match = clause.match(/^(?:the\s+)?(.+?)\s+of\s+(.+?)\s+(is|are|was|were)\s+([^,]+)$/i);
  if (!match || !/^[A-Z0-9]/.test(match[4].trim()) || match[4].trim().split(/\s+/).length > 8) return { claim: clause };
  const [, relation, scope, verb, subject] = match;
  return { claim: `${subject.trim()} ${verb} the ${relation.trim()} of ${scope.trim()}`, subject: subject.trim(), scope: scope.trim() };
};

const appositiveClaims = (subject: string, phrase: string, scope?: string): string[] =>
  phrase.split(/\s+and\s+/i).map((part) => {
    const predicate = part.replace(/^(?:a|an)\s+/i, "").trim();
    const article = /^(?:the\s+)?(?:largest|smallest|northernmost|southernmost|oldest|newest|highest|lowest)\b/i.test(predicate) && !/^the\s+/i.test(predicate) ? "the " : "";
    const needsScope = Boolean(scope && /^(?:the\s+)?(?:largest|smallest|oldest|newest|highest|lowest)\b/i.test(predicate) && !/\b(?:of|in|among)\b/i.test(predicate));
    return `${subject} is ${article}${predicate}${needsScope ? ` in ${scope}` : ""}`;
  });

const splitAnswerClaim = (sentence: string, priorSubject?: string): { claims: string[]; subject?: string } => {
  const cleaned = stripVerificationCommentary(sentence.replace(/^[\s#>*\d.)-]+/, "").replace(/\s+/g, " "));
  if (!cleaned) return { claims: [], subject: priorSubject };

  const relative = cleaned.match(/^([^,]+),\s+which\s+([^,]+),\s+(.+)$/i);
  if (relative) {
    const subject = relative[1].trim();
    return { claims: [`${subject} ${relative[2].trim()}`, ...splitCoordinatedPredicates(`${subject} ${relative[3].trim()}`, subject).claims], subject };
  }

  const parts = cleaned.split(/,\s+(?!\d)/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3 && !parseSubjectPredicate(parts[0]) && !FACTUAL_PREDICATE.test(parts[1]) && PREDICATE_START.test(parts[2])) {
    const subject = parts[0];
    return { claims: [`${subject} was ${parts[1].replace(/^(?:a|an)\s+/i, "")}`, ...splitCoordinatedPredicates(`${subject} ${parts.slice(2).join(", ")}`, subject).claims], subject };
  }

  const inverted = invertRelationalCopula(parts[0]);
  const resolvedPronoun = inverted.claim.replace(/^(It|This (?:city|company|treatment|product|drug)|The (?:city|company))\s+/i, priorSubject ? `${priorSubject} ` : "$&");
  const resolvedMain = priorSubject && PREDICATE_START.test(resolvedPronoun)
    ? `${priorSubject} ${resolvedPronoun.charAt(0).toLowerCase()}${resolvedPronoun.slice(1)}`
    : resolvedPronoun;
  const parsedMain = parseSubjectPredicate(resolvedMain);
  const subject = inverted.subject ?? parsedMain?.subject ?? priorSubject;
  const claims = splitCoordinatedPredicates(resolvedMain, subject).claims;

  for (const tail of parts.slice(1)) {
    if (!subject) continue;
    if (UNSAFE_SUBORDINATE_START.test(tail)) continue;
    if (PARTICIPIAL_START.test(tail)) {
      const auxiliary = /^(born|founded|established|launched)\b/i.test(tail) ? "was" : "is";
      claims.push(`${subject} ${auxiliary} ${tail}`);
    } else if (!FACTUAL_PREDICATE.test(tail)) {
      claims.push(...appositiveClaims(subject, tail, inverted.scope));
    } else {
      claims.push(...splitCoordinatedPredicates(`${subject} ${tail}`, subject).claims);
    }
  }
  return { claims, subject };
};

export const extractAnswerClaims = (text: string, limit = ANSWER_CLAIM_LIMIT): string[] => {
  const sentences = text
    .split(/\n+|(?<=[.!?;])\s+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const candidates: string[] = [];
  let subject: string | undefined;

  for (const sentence of sentences) {
    const atomic = splitAnswerClaim(sentence, subject);
    subject = atomic.subject ?? subject;
    candidates.push(...atomic.claims);
  }

  const accepted: string[] = [];
  const acceptedTokens: string[][] = [];
  for (const candidate of candidates) {
    const claim = candidate.replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim();
    if (!isAnswerClaim(claim)) continue;
    const tokens = answerSimilarityTokens(claim);
    if (acceptedTokens.some((existing) => tokenOverlap(existing, tokens) >= 0.72)) continue;
    accepted.push(withTerminalPunctuation(claim));
    acceptedTokens.push(tokens);
    if (accepted.length >= Math.max(1, limit)) break;
  }
  return accepted;
};

export interface ExtractedClaim { claim: string; confidence: number; }

export const extractClaimsWithConfidence = (text: string): ExtractedClaim[] =>
  extractClaims(text).map((claim) => ({ claim, confidence: /\d/.test(claim) || CLAIM_CUES.test(claim) ? 0.9 : 0.78 }));
