import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);

    constructor(
        private readonly mailerService: MailerService,
        private readonly config: ConfigService,
    ) {}

    /** The verified Brevo sender; every message goes out as this address. */
    private get from(): string {
        return this.config.get<string>('MAIL_FROM') ?? 'promisebedzo07@gmail.com';
    }

    async sendMail(to: string, subject: string, text: string): Promise<void> {
        await this.mailerService.sendMail({
            from: this.from,
            to,
            subject,
            text,
        });
    }

    async sendWelcomeEmail(to: string, userName: string): Promise<void> {
        await this.mailerService.sendMail({
            from: this.from,
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
     * has already written the user row by this point, and the mobile app can
     * always ask for another code at POST /api/otp. So this logs and returns
     * rather than throwing.
     */
    async sendOtpEmail(to: string, code: string, minutes: number): Promise<void> {
        try {
            await this.mailerService.sendMail({
                from: this.from,
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
                error instanceof Error ? error.stack : String(error),
            );
        }
    }
}
