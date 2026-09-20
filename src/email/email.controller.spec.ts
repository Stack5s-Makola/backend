import { Test, TestingModule } from '@nestjs/testing';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';

describe('EmailController', () => {
  let controller: EmailController;
  let service: { sendMail: jest.Mock };

  beforeEach(async () => {
    service = { sendMail: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailController],
      providers: [{ provide: EmailService, useValue: service }],
    }).compile();

    controller = module.get<EmailController>(EmailController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes the message through to the service', async () => {
    await controller.sendEmail({
      to: 'buyer@example.com',
      subject: 'Hi',
      text: 'Hello',
    });

    expect(service.sendMail).toHaveBeenCalledWith(
      'buyer@example.com',
      'Hi',
      'Hello',
    );
  });
});
