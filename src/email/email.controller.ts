import { Controller, Post, Body } from '@nestjs/common';
import { EmailService } from './email.service';

@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}
  @Post('send')
  async sendEmail(@Body() body: { to: string; subject: string; text: string }) {
    await this.emailService.sendMail(body.to, body.subject, body.text);
    return { message: 'Email sent successfully' };
  }
}
