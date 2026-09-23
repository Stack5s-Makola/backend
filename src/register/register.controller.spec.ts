import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { validationPipe } from '../common/validation';
import { RegisterController } from './register.controller';
import { RegisterService } from './register.service';

/** The envelope the response interceptor and exception filter both emit. */
interface Envelope {
  success: boolean;
  message: string;
  data: unknown;
  errors?: Record<string, string>;
}

const valid = {
  email: 'ama@example.com',
  phone: '0241234567',
  password: 'correct-horse',
  name: 'Ama Mensah',
  shopName: 'Makola Fabrics',
  location: { latitude: 5.55, longitude: -0.2 },
  role: 'SELLER',
};

describe('POST /register/set-seller-profile', () => {
  const setSellerProfile = jest.fn();
  const registerBuyer = jest.fn();
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [RegisterController],
      providers: [
        {
          provide: RegisterService,
          useValue: { setSellerProfile, registerBuyer },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(validationPipe);
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    setSellerProfile.mockResolvedValue({
      message: 'Seller profile created',
      data: { saved: true },
    });
    registerBuyer.mockResolvedValue({
      message: 'Account created. Check your email for a verification code.',
      data: { saved: true },
    });
  });

  const post = async (body: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post('/register/set-seller-profile')
      .send(body);

    return { status: res.status, body: res.body as Envelope };
  };

  it('200 and saved true on a good body', async () => {
    const { status, body } = await post(valid);

    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: 'Seller profile created',
      data: { saved: true },
    });
  });

  it('409 and no saved flag when the email is taken', async () => {
    setSellerProfile.mockRejectedValue(
      new ConflictException('An account with that email already exists'),
    );

    const { status, body } = await post(valid);

    expect(status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      message: 'An account with that email already exists',
      data: null,
    });
  });

  it('never echoes the password back', async () => {
    const { body } = await post(valid);

    expect(JSON.stringify(body)).not.toContain(valid.password);
  });

  it('normalises the email and phone before the service sees them', async () => {
    await post({
      ...valid,
      email: '  AMA@Example.COM ',
      phone: '024 123 4567',
    });

    expect(setSellerProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ama@example.com',
        phone: '0241234567',
      }),
      undefined,
    );
  });

  it.each([
    ['email', { ...valid, email: 'not-an-email' }],
    ['phone', { ...valid, phone: '123' }],
    ['password', { ...valid, password: 'short' }],
    ['name', { ...valid, name: '   ' }],
    ['shopName', { ...valid, shopName: '' }],
    ['role', { ...valid, role: 'ADMIN' }],
  ])('400 when %s is bad', async (field, body) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty(field);
  });

  it('400 when the coordinates are out of range', async () => {
    const { status, body } = await post({
      ...valid,
      location: { latitude: 999, longitude: -0.2 },
    });

    expect(status).toBe(400);
    expect(body.errors?.['location.latitude']).toContain('between -90 and 90');
  });

  it('forwards a body with no location - the service rejects it', async () => {
    // location became optional on the DTO so multipart can send flat
    // latitude/longitude instead. RegisterService is what now requires one
    // form or the other; see its spec.
    const withoutLocation: Record<string, unknown> = { ...valid };
    delete withoutLocation.location;

    await post(withoutLocation);

    expect(setSellerProfile).toHaveBeenCalled();
  });

  it('accepts flat latitude and longitude, as multipart sends them', async () => {
    const flat: Record<string, unknown> = { ...valid };
    delete flat.location;
    flat.latitude = 5.55;
    flat.longitude = -0.2;

    const { status } = await post(flat);

    expect(status).toBe(200);
    expect(setSellerProfile).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 5.55, longitude: -0.2 }),
      undefined,
    );
  });

  it('accepts a lowercase role and passes it on uppercased', async () => {
    await post({ ...valid, role: 'seller' });

    expect(setSellerProfile).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'SELLER' }),
      undefined,
    );
  });

  it('trims the names before they reach the service', async () => {
    await post({ ...valid, name: '  Ama Mensah  ', shopName: '  Shop  ' });

    expect(setSellerProfile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ama Mensah', shopName: 'Shop' }),
      undefined,
    );
  });

  const buyer = {
    email: 'kofi@example.com',
    phone: '0241234567',
    password: 'correct-horse',
    role: 'BUYER',
  };

  const postBuyer = async (body: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post('/register/buyer')
      .send(body);

    return { status: res.status, body: res.body as Envelope };
  };

  it('200 on a good buyer sign-up', async () => {
    const { status, body } = await postBuyer(buyer);

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { saved: true } });
  });

  it('409 when the buyer email is taken', async () => {
    registerBuyer.mockRejectedValue(
      new ConflictException('An account with that email already exists'),
    );

    const { status, body } = await postBuyer(buyer);

    expect(status).toBe(409);
    expect(body.message).toBe('An account with that email already exists');
  });

  it.each([
    ['email', { ...buyer, email: 'not-an-email' }],
    ['phone', { ...buyer, phone: '123' }],
    ['password', { ...buyer, password: 'short' }],
    ['role', { ...buyer, role: 'ADMIN' }],
  ])('400 when the buyer %s is bad', async (field, payload) => {
    const res = await postBuyer(payload);

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty(field);
  });

  it('needs no shop name or location', async () => {
    expect((await postBuyer(buyer)).status).toBe(200);
  });

  it('normalises the buyer email and phone', async () => {
    await postBuyer({
      ...buyer,
      email: '  KOFI@Example.COM ',
      phone: '024 123 4567',
    });

    expect(registerBuyer).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'kofi@example.com',
        phone: '0241234567',
      }),
      undefined,
    );
  });
});
