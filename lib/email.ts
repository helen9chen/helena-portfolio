import emailjs from "@emailjs/browser";

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

export const emailConfigured = Boolean(SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY);

export interface ContactParams {
  name: string;
  email: string;
  message: string;
  time: string;
}

// Sends the contact note through EmailJS. Throws if the send fails so the
// caller can react (the contact form sends the email *before* saving to the DB).
export async function sendContactEmail(params: ContactParams): Promise<void> {
  if (!emailConfigured) return; // no-op when EmailJS isn't set up
  await emailjs.send(SERVICE_ID!, TEMPLATE_ID!, { ...params }, { publicKey: PUBLIC_KEY! });
}
