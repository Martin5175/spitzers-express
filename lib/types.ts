export type Contact = {
  id: string; name: string; phone: string | null; email: string | null;
  instructions: string | null; notes: string | null; aliases: string[];
  photo_text_to: "customer" | "dropoff" | "pickup" | "none";
  invoice_email: string | null; wants_invoices: boolean; photo_message?: string | null;
};
export type Address = { id: string; contact_id: string | null; line: string; area: string | null; notes: string | null };
export type StopKind = "pickup" | "dropoff";
export type Stop = {
  id: string; job_id: string; seq: number; kind: StopKind;
  contact_id: string | null; address_id: string | null; address_text: string | null;
  area: string | null; instructions: string | null; status: "pending" | "done";
  completed_at: string | null; route_order: number;
};
export type DeliveryStatus = "upcoming" | "picked_up" | "delivered" | "cancelled";
export type Job = {
  id: string; job_date: string; customer_id: string | null; description: string | null;
  notes: string | null; price: number | null; delivery_status: DeliveryStatus;
  invoice_requested: boolean; invoice_id: string | null; source: string; created_at: string;
};
export type JobMoney = { job_id: string; customer_id: string | null; total: number; paid: number; balance: number; payment_status: "unpaid" | "partial" | "paid" };
export type JobFull = Job & { stops: Stop[]; customer?: Contact | null; money?: JobMoney | null };
