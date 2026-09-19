import { Test, TestingModule } from '@nestjs/testing';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';

describe('OtpController', () => {
  let controller: OtpController;
  let service: { issue: jest.Mock };

  beforeEach(async () => {
    service = {
      issue: jest.fn().mockResolvedValue({
        email: 'buyer@example.com',
        purpose: 'email_verification',
        expiresAt: new Date('2026-01-01T00:10:00Z'),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OtpController],
      providers: [{ provide: OtpService, useValue: service }],
    }).compile();

    controller = module.get<OtpController>(OtpController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('defaults the purpose to email verification', async () => {
    await controller.requestOtp({ email: 'buyer@example.com' });
    expect(service.issue).toHaveBeenCalledWith('buyer@example.com', undefined);
  });

  it('forwards an explicit purpose', async () => {
    await controller.requestOtp({
      email: 'buyer@example.com',
      purpose: 'password_reset',
    });
    expect(service.issue).toHaveBeenCalledWith(
      'buyer@example.com',
      'password_reset',
    );
  });

  it('never puts the code in the response', async () => {
    const result = await controller.requestOtp({ email: 'buyer@example.com' });
    expect(result.data).not.toHaveProperty('code');
  });
});
