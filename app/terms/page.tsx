import type { Metadata } from "next";
import LegalPage, { BIZ, PHONE } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms & Conditions – Spitzer's Express" };

export default function Terms() {
  return (
    <LegalPage title="Terms & Conditions">
      <p>These terms apply to delivery and messenger services provided by {BIZ} (&quot;Spitzer&apos;s Express&quot;, &quot;we&quot;, &quot;us&quot;). By placing an order or using our services, you agree to these terms.</p>

      <h2>Our services</h2>
      <p>We pick up and deliver packages and items for individuals and businesses in Brooklyn, Monsey, Monroe and surrounding areas. Pickup and delivery times are estimates and may be affected by traffic, weather and other conditions outside our control.</p>

      <h2>Orders and accurate information</h2>
      <p>You are responsible for giving us correct pickup and drop-off addresses, contact names, phone numbers and any special instructions, and for making sure someone is available, or that a safe place is arranged, at pickup and drop-off. Extra trips, returns or waiting time caused by incorrect information or no one being available may be charged.</p>

      <h2>Items we do not carry</h2>
      <p>We do not transport illegal items, hazardous materials, weapons, or anything prohibited by law. We may refuse any item we reasonably believe is unsafe or not properly packed. You are responsible for packing items securely.</p>

      <h2>Prices and payment</h2>
      <ul>
        <li>Prices are agreed when you place the order. Extra stops, returns, waiting time or other extras may be added as agreed.</li>
        <li>Payment is due on delivery unless we have agreed to invoice you. Invoices are due when received unless otherwise agreed.</li>
        <li>We accept Zelle, cash, check and other methods we agree to. We do not process card payments through our website or text messages.</li>
      </ul>

      <h2>Proof of delivery</h2>
      <p>We may photograph items at drop-off as proof of delivery and send the photo to the customer or recipient by text message or email. A delivery photo, or our delivery record, is evidence that the delivery was completed.</p>

      <h2>Text messages</h2>
      <p>By giving us a mobile number, you agree to receive transactional text messages about your deliveries, such as delivery confirmations and photos. Message frequency varies. Message and data rates may apply. Reply <b>STOP</b> to opt out or <b>HELP</b> for help, or call {PHONE}. Carriers are not liable for delayed or undelivered messages. See our <a href="/privacy" className="link">Privacy Policy</a> for how we handle your information.</p>

      <h2>Loss or damage</h2>
      <p>We handle every item with care. If an item is lost or damaged while in our possession, notify us within 48 hours of the scheduled delivery. Unless we agree otherwise in writing before pickup, our liability for any one delivery is limited to the lesser of the item&apos;s actual value or $100. We are not responsible for damage caused by inadequate packing, for the contents of sealed packages, or for indirect or consequential losses. Let us know before pickup if an item is fragile or of high value.</p>

      <h2>Cancellations</h2>
      <p>Please cancel as early as possible. If we have already started the trip, a charge may apply.</p>

      <h2>Changes to these terms</h2>
      <p>We may update these terms from time to time. The date at the top shows when they were last changed.</p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of the State of New York.</p>

      <h2>Contact us</h2>
      <p>{BIZ} · {PHONE}</p>
    </LegalPage>
  );
}
