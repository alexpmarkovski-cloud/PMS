import nodemailer from "nodemailer";

// App-level transactional email (maintenance alerts — distinct from the
// auth emails Supabase sends itself). Env-configured for production
// (launch_decisions item 7: Gmail/Workspace SMTP); the defaults target
// the local Supabase Mailpit (config.toml → [local_smtp] smtp_port), so
// local sends show up at http://localhost:54324 with no setup.
export function createMailTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "127.0.0.1",
    port: Number(process.env.SMTP_PORT ?? 54325),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

export const MAIL_FROM = process.env.SMTP_FROM ?? "PMS <no-reply@pms.local>";
