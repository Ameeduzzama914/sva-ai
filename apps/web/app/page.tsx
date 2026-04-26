import { ChatLayout } from "../components/chat-layout";

export default function HomePage() {
  return (
    <>
      <section style={{ padding: "1.5rem 1.5rem 0", maxWidth: 1200, margin: "0 auto" }}>
        <h1>Don’t trust AI blindly. Verify it.</h1>
        <p>SVA compares models, checks evidence, and gives a trust verdict.</p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <span>✅ 4 AI models compared</span>
          <span>✅ Evidence-backed verification</span>
          <span>✅ Contradiction detection</span>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <a href="#verify">Start verifying</a>
          <a href="#upgrade">Upgrade to Pro</a>
        </div>
      </section>
      <div id="verify">
        <ChatLayout />
      </div>
    </>
  );
}
