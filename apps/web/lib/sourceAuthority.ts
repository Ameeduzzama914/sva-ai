export type SourceTier = 1 | 2 | 3 | 4 | 5;

const TIER_1 = ["nih.gov", "pubmed.ncbi.nlm.nih.gov", "nejm.org", "nature.com", "thelancet.com", "jamanetwork.com", "who.int", "cdc.gov", "mayoclinic.org", "clevelandclinic.org", "harvard.edu", "hopkinsmedicine.org", "science.org", "sciencedirect.com"];
const TIER_2 = [".gov", ".edu", "nhs.uk", "bmj.com", "cochrane", "medline", "healthsystem", "university", "ac.uk"];
const TIER_3 = ["reuters.com", "bbc.com", "nytimes.com", "scientificamerican.com", "webmd.com", "medicalnewstoday.com", "healthline.com"];
const TIER_4 = ["blog", "medium.com", "substack", "youtube.com", "opinion"];
const TIER_5 = ["facebook.com", "reddit.com", "quora.com", "x.com", "twitter.com", "tiktok.com", "forum"];

const tierForDomain = (domain: string): SourceTier => {
  const d = domain.toLowerCase();
  if (TIER_1.some((i) => d.includes(i))) return 1;
  if (TIER_2.some((i) => d.includes(i))) return 2;
  if (TIER_3.some((i) => d.includes(i))) return 3;
  if (TIER_5.some((i) => d.includes(i))) return 5;
  if (TIER_4.some((i) => d.includes(i))) return 4;
  return 4;
};

export const scoreDomainAuthority = (domain: string): number => {
  const tier = tierForDomain(domain);
  if (tier === 1) return 96;
  if (tier === 2) return 88;
  if (tier === 3) return 72;
  if (tier === 4) return 45;
  return 18;
};

export const sourceTrustLabel = (score: number): "Very High Trust" | "High Trust" | "Medium Trust" | "Weak Source" => {
  if (score >= 90) return "Very High Trust";
  if (score >= 75) return "High Trust";
  if (score >= 55) return "Medium Trust";
  return "Weak Source";
};

export const sourceCategory = (domain: string): string => {
  const tier = tierForDomain(domain);
  return tier === 1 ? "Elite Scientific/Gov" : tier === 2 ? "Institutional" : tier === 3 ? "Established Media" : tier === 4 ? "Blog/Explainer" : "Social/Forum";
};
