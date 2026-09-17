import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
    constructor(private readonly mailerService: MailerService) {}

    async sendMail(to: string, subject: string, text: string): Promise<void> {
        await this.mailerService.sendMail({
            from: 'promisebedzo07@gmail.com',
            to,
            subject,
            text,
        });
    }

    async sendWelcomeEmail(to: string, userName: string): Promise<void> {
        await this.mailerService.sendMail({
            to,
            subject: 'Welcome to Makola!',
            text: `Hello ${userName},\n\nWelcome to Makola. We are glad to have you on board!`,
            html: `<h3>Hello ${userName},</h3><p>Welcome to Makola. We are glad to have you on board!</p>`,
        });
    }
}