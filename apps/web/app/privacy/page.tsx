import { LegalPageShell } from "../../components/public-shell";

const sections = [
  { title: "What SVA stores", body: "SVA stores only the information required to provide verification, account, usage, and billing functionality." },
  { title: "Verification queries and results", body: "Verification queries, retrieved evidence, model responses, Trust Scores, and final results may be stored so you can review history and so SVA can operate the verification workflow." },
  { title: "Account email and usage counters", body: "SVA stores your account email, selected plan, daily usage counters, and related account metadata to enforce Free, Pro, and Ultra plan limits." },
  { title: "Data security", body: "SVA uses reasonable technical and organizational safeguards to protect account and verification data. Access is limited to what is needed to operate, debug, secure, and improve the service." },
  { title: "Sensitive data warning", body: "Do not submit highly sensitive personal, medical, legal, or financial information. SVA is assistive and should not replace professional advice." },
  { title: "Payments and billing", body: "Billing data is used only to manage subscriptions, plan access, invoices, and payment-related support. Payment processor records may be governed by the processor's own privacy terms." },
  { title: "Your data is never sold", body: "Your data is never sold. SVA does not sell verification queries, account information, or usage history to third parties." },
  { title: "Contact", body: "For privacy or support questions, contact: mohammed.ameeduzzama@gmail.com" },
  { title: "Last updated", body: "June 14, 2026" }
];

export default function PrivacyPage() {
  return <LegalPageShell eyebrow="Privacy · Security" title="Privacy Policy" introduction="SVA is designed to verify answers while collecting only the information needed to run account, usage, billing, and verification features." sections={sections} />;
}
