import { LegalPageShell } from "../../components/public-shell";

const sections = [
  { title: "Nature of the service", body: "SVA is an experimental verification assistant. Results may be incorrect and must be independently verified." },
  { title: "Verification limitations", body: "SVA helps compare AI responses, evidence, and contradictions, but its output is assistive and does not guarantee accuracy." },
  { title: "High-stakes use", body: "SVA must not be used as the sole basis for medical, legal, or financial decisions." },
  { title: "Responsible use", body: "By using SVA you agree to responsible use and to independently check information that could materially affect you or others." },
  { title: "Third-party AI providers", body: "By using SVA you acknowledge third-party AI provider dependencies and that provider availability may affect results." }
];

export default function TermsPage() {
  return <LegalPageShell eyebrow="Legal · Trust" title="Terms of Service" introduction="These terms describe the essential conditions for using SVA. The service supports verification workflows, but it does not replace independent judgment." sections={sections} />;
}
