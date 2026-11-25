import type { Metadata } from "next";
import LegalPage, { BIZ, PHONE } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy – Spitzer's Express" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>{BIZ} (&quot;Spitzer&apos;s Express&quot;, &quot;we&quot;, &quot;us&quot;) is a courier and messenger service serving Brooklyn, Monsey, Monroe and surrounding areas. This policy explains what information we collect when you use our delivery services, how we use it, and the choices you have.</p>

      <h2>Information we collect</h2>
      <ul>
        <li><b>Contact details:</b> names, phone numbers and email addresses of customers, senders and recipients.</li>
        <li><b>Delivery details:</b> pickup and drop-off addresses, delivery instructions, descriptions of items, and dates and times of deliveries.</li>
        <li><b>Delivery photos:</b> photos taken at drop-off as proof of delivery.</li>
        <li><b>Billing records:</b> charges, payments received, payment method (for example Zelle, cash or check) and invoices. We do not store credit or debit card numbers.</li>
        <li><b>Messages:</b> records of text messages and emails we send you about your deliveries.</li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To pick up and deliver your items and contact you or the recipient about them.</li>
        <li>To send delivery confirmations, including a photo of the completed delivery.</li>
        <li>To send invoices and keep track of payments and balances.</li>
        <li>To keep records of past deliveries so repeat orders are faster.</li>
      </ul>

      <h2>Text messages (SMS/MMS)</h2>
      <p>If you give us your mobile number when you place an order or are named as a recipient, we may text you delivery updates and proof-of-delivery photos. These messages are transactional only; we do not send marketing texts. Message frequency varies with the number of deliveries. Message and data rates may apply. Reply <b>STOP</b> to stop receiving texts, or <b>HELP</b> for help. You can also call {PHONE}.</p>
      <p><b>We do not sell, rent or share mobile phone numbers or text messaging consent with third parties or affiliates for marketing or promotional purposes.</b> Text messaging originator opt-in data and consent will not be shared with any third parties.</p>

      <h2>When we share information</h2>
      <p>We do not sell your personal information. We share it only:</p>
      <ul>
        <li>With service providers that help us run the business, such as our text messaging provider, email provider, and secure data hosting. They may use the information only to provide those services to us.</li>
        <li>Between the sender and recipient of a delivery, where needed to complete it (for example, sending the delivery photo to the person who ordered it).</li>
        <li>When required by law, or to protect our rights, property or safety, or that of others.</li>
      </ul>

      <h2>How we protect it</h2>
      <p>Our records and delivery photos are stored with a secure hosting provider and are available only to authorized Spitzer&apos;s Express staff through a password-protected system. No method of storage is 100% secure, but we take reasonable steps to protect your information.</p>

      <h2>How long we keep it</h2>
      <p>We keep delivery and billing records for as long as needed to provide our services and to meet tax, accounting and legal requirements.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Reply STOP to any text to stop receiving texts.</li>
        <li>Ask us to see, correct or delete your information by calling {PHONE}. We may need to keep some records where the law requires it.</li>
      </ul>

      <h2>Children</h2>
      <p>Our services are not directed to children under 13, and we do not knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>We may update this policy from time to time. The date at the top shows when it was last changed.</p>

      <h2>Contact us</h2>
      <p>{BIZ} · {PHONE}</p>
    </LegalPage>
  );
}
