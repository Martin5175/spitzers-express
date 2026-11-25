import type { Metadata } from "next";
import LegalPage, { BIZ, PHONE } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Text Message Consent – Spitzer's Express" };

export default function SmsConsent() {
  return (
    <LegalPage title="Text Message Consent">
      <p>Spitzers Express ({BIZ}) sends text messages only to confirm completed deliveries, with a photo of the delivered item. We never send marketing texts.</p>

      <h2>How customers agree to receive texts</h2>
      <p>Customers place delivery orders by phone call or message with our driver. A customer agrees to receive delivery texts in one of two ways:</p>
      <ul>
        <li><b>The customer asks for it.</b> Many customers request a delivery photo by text when they place their order and give us the mobile number to send it to.</li>
        <li><b>We ask and the customer says yes.</b> When a customer first orders, the driver asks:</li>
      </ul>
      <blockquote style={{ margin: "12px 0", padding: "14px 16px", background: "#fff", border: "1.5px solid var(--line)", borderRadius: 12, fontSize: 17 }}>
        &ldquo;Can we text you delivery updates and a photo at this number? Message and data rates may apply. Reply STOP anytime to opt out, or HELP for help.&rdquo;
      </blockquote>
      <p>We text only customers who agree. For each customer we record who receives the delivery photo (the customer, the recipient, or no one).</p>

      <h2>What we send</h2>
      <ul>
        <li>One text per completed delivery, with a proof-of-delivery photo.</li>
        <li>Example: &ldquo;Hi Gemsli, your delivery to 52 Bakertown Rd was completed at 2:15 PM. Photo attached. Thank you! – Spitzer&apos;s Express {PHONE}&rdquo;</li>
        <li>Message frequency varies with the number of deliveries. Message and data rates may apply.</li>
      </ul>

      <h2>Stopping texts</h2>
      <p>Reply <b>STOP</b> to any message to stop receiving texts. Reply <b>HELP</b> for help, or call {PHONE}.</p>
      <p>Mobile numbers and text consent are never shared with third parties or affiliates for marketing. See our <a href="/privacy" className="link">Privacy Policy</a> and <a href="/terms" className="link">Terms &amp; Conditions</a>.</p>
    </LegalPage>
  );
}
