/** Nodemailer SMTP adapter sends real tenant-configured emails. */
import nodemailer from "nodemailer";
import type { EmailSender } from "../application/email-settings-service.js";

export class NodemailerEmailSender implements EmailSender {
  async send(input: Parameters<EmailSender["send"]>[0]): Promise<void> {
    const transport = nodemailer.createTransport({
      host: input.host,
      port: input.port,
      secure: input.secure,
      auth: { user: input.username, pass: input.password },
    });

    await transport.sendMail({
      from: `${input.fromName} <${input.fromEmail}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
  }
}
