import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let service: { register: jest.Mock; login: jest.Mock; verifyOtp: jest.Mock };

  beforeEach(async () => {
    service = {
      register: jest.fn().mockResolvedValue({ data: {} }),
      login: jest.fn().mockResolvedValue({ data: {} }),
      verifyOtp: jest.fn().mockResolvedValue({ data: {} }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes the register body straight through', async () => {
    const body = {
      email: 'new@example.com',
      phone: '0241234567',
      password: 'longenough',
    };
    await controller.register(body);
    expect(service.register).toHaveBeenCalledWith(body);
  });

  it('passes the login body straight through', async () => {
    const body = { email: 'buyer@example.com', password: 'secret' };
    await controller.login(body);
    expect(service.login).toHaveBeenCalledWith(body);
  });

  it('passes the verify-otp body straight through', async () => {
    const body = { email: 'buyer@example.com', code: '123456' };
    await controller.verifyOtp(body);
    expect(service.verifyOtp).toHaveBeenCalledWith(body);
  });
});
