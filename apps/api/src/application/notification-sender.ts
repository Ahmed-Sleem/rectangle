/**
 * Outbound transactional email.
 *
 * Wraps the tenant's own SMTP configuration so the lifecycle services do not
 * each reimplement "look up settings, decrypt the password, send". Every send
 * fails loudly when delivery is unconfigured or switched off: an invitation
 * that silently goes nowhere leaves an administrator waiting for somebody who
 * was never contacted.
 *
 * Bodies are English only. The recipient's language preference lives on an
 * account they may not have yet, and guessing from a browser that is not in
 * the loop would be a worse answer than one consistent one.
 */
import { DomainError } from "../domain/errors.js";
import { decryptSecret } from "../infrastructure/secret-crypto.js";
import type { EmailSender, EmailSettingsRepository } from "./email-settings-service.js";

export interface OutboundMessage {
  to: string;
  subject: string;
  text: string;
}

export interface NotificationSender {
  send(tenantId: string, message: OutboundMessage): Promise<void>;
}

export class SmtpNotificationSender implements NotificationSender {
  constructor(
    private readonly settings: EmailSettingsRepository,
    private readonly sender: EmailSender,
  ) {}

  async send(tenantId: string, message: OutboundMessage): Promise<void> {
    const configuration = await this.settings.get(tenantId);
    if (!configuration || !configuration.enabled) {
      // CONFIGURATION_REQUIRED maps to 503, which distinguishes "this company
      // has not set email up" from "the address was rejected".
      throw new DomainError(
        "CONFIGURATION_REQUIRED",
        "Email delivery is not configured. Set up email in Settings before sending invitations or password resets.",
      );
    }

    await this.sender.send({
      host: configuration.host,
      port: configuration.port,
      secure: configuration.secure,
      username: configuration.username,
      password: decryptSecret(configuration.encryptedPassword),
      fromEmail: configuration.fromEmail,
      fromName: configuration.fromName,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

/**
 * Message bodies.
 *
 * Plain text, no markup: these pass through spam filters more reliably, and a
 * transactional message that renders identically everywhere is worth more
 * than one that is prettier where it happens to render.
 */
export const messages = {
  invitation(companyName: string, inviterName: string, link: string, expiresInDays: number) {
    return {
      subject: `You have been invited to ${companyName} on Rectangle`,
      text: [
        `${inviterName} has invited you to join ${companyName} on Rectangle.`,
        "",
        "Set your password to activate your account:",
        link,
        "",
        `This link expires in ${expiresInDays} days and can be used once.`,
        "If you were not expecting this invitation, you can ignore this message.",
      ].join("\n"),
    };
  },

  passwordReset(companyName: string, link: string, expiresInMinutes: number) {
    return {
      subject: `Reset your ${companyName} password`,
      text: [
        `Somebody asked to reset the password for your ${companyName} account on Rectangle.`,
        "",
        "Choose a new password:",
        link,
        "",
        `This link expires in ${expiresInMinutes} minutes and can be used once.`,
        "If this was not you, no action is needed — your password has not changed.",
      ].join("\n"),
    };
  },

  emailChangeConfirm(companyName: string, link: string, expiresInMinutes: number) {
    return {
      subject: `Confirm your new ${companyName} email address`,
      text: [
        `This address was given as the new sign-in email for a ${companyName} account on Rectangle.`,
        "",
        "Confirm the change:",
        link,
        "",
        `This link expires in ${expiresInMinutes} minutes and can be used once.`,
        "Until you confirm, the account keeps its current address.",
      ].join("\n"),
    };
  },

  /**
   * Sent to the address being replaced.
   *
   * This is the part that catches an account takeover: whoever still controls
   * the old address is told what happened and given a way to undo it.
   */
  emailChangeWarning(companyName: string, newEmail: string, revertLink: string) {
    return {
      subject: `The email address on your ${companyName} account was changed`,
      text: [
        `The sign-in address for your ${companyName} account on Rectangle was changed to ${newEmail}.`,
        "",
        "If you made this change, nothing further is needed.",
        "",
        "If you did not, use this link to put your address back and lock the account for review:",
        revertLink,
      ].join("\n"),
    };
  },
};
