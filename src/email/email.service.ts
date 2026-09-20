import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Brevo's transactional email endpoint. */
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const REQUEST_TIMEOUT_MS = 10_000;

interface Message {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends mail through Brevo's HTTP API rather than its SMTP relay.
 *
 * The API takes the `BREVO_API_KEY` that is already configured, and it needs
 * nothing but outbound HTTPS — hosts that block port 587, which many do,
 * would silently swallow every SMTP message.
 *
 * The sender address must be a verified sender in the Brevo dashboard, or
 * Brevo rejects the request with a 400.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  private get sender() {
    return {
      email: this.config.get<string>('MAIL_FROM') ?? 'promisebedzo07@gmail.com',
      name: this.config.get<string>('MAIL_FROM_NAME') ?? 'Makola',
    };
  }

  async sendMail(to: string, subject: string, text: string): Promise<void> {
    await this.deliver({ to, subject, text });
  }

  async sendWelcomeEmail(to: string, userName: string): Promise<void> {
    await this.deliver({
      to,
      subject: 'Welcome to Makola!',
      text: `Hello ${userName},\n\nWelcome to Makola. We are glad to have you on board!`,
      html: `<h3>Hello ${userName},</h3><p>Welcome to Makola. We are glad to have you on board!</p>`,
    });
  }

  /**
   * Delivers a one-time code.
   *
   * A failed send must not fail the request that triggered it: registration
   * has already written the user row by this point, and the app can always
   * ask for another code at POST /api/otp. So this logs loudly and returns
   * rather than throwing.
   */
  async sendOtpEmail(to: string, code: string, minutes: number): Promise<void> {
    try {
      await this.deliver({
        to,
        subject: 'Your Makola verification code',
        text: `Your Makola verification code is ${code}. It expires in ${minutes} minutes.`,
        html:
          `<p>Your Makola verification code is:</p>` +
          `<p style="font-size:24px;letter-spacing:4px;"><strong>${code}</strong></p>` +
          `<p>It expires in ${minutes} minutes. If you did not ask for it, you can ignore this email.</p>`,
      });
    } catch (error) {
      this.logger.error(
        `Could not send the verification code to ${to}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async deliver(message: Message): Promise<void> {
    const apiKey = this.config.get<string>('BREVO_API_KEY');

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Email is not configured: BREVO_API_KEY is missing',
      );
    }

    let response: Response;

    try {
      response = await fetch(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: this.sender,
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
          ...(message.html ? { htmlContent: message.html } : {}),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // A timeout or a DNS/socket failure, never a rejection from Brevo
      throw new ServiceUnavailableException(
        `Could not reach the email provider: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!response.ok) {
      // Brevo explains a rejection in the body; an unverified sender and a
      // bad key both land here and look identical without it.
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `Brevo rejected the message to ${message.to}: ${response.status} ${detail}`,
      );
      throw new ServiceUnavailableException('The email could not be sent');
    }
  }
}
