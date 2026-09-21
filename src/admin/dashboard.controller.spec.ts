import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtPayload } from '../common/guards/jwt-auth.guard';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { BuyersService } from './buyers.service';
import { DashboardService } from './dashboard.service';
import { ListingsService } from './listings.service';
import { SellersService } from './sellers.service';

const SECRET = 'test-secret';

/** The envelope the response interceptor and exception filter both emit. */
interface Envelope {
  success: boolean;
  message: string;
  data: unknown;
}

const TOTALS = {
  message: 'Dashboard totals retrieved',
  data: {
    totalUsers: 40,
    totalSellers: 12,
    totalBuyers: 27,
    totalListings: 93,
  },
};

const SELLERS = {
  message: 'Sellers retrieved',
  data: [
    {
      id: 'aaaaaaaa-1111-4111-8111-111111111111',
      name: null,
      email: 'ama@example.com',
      profilePicture: null,
      businessName: 'Makola Fabrics',
      location: { latitude: 5.55, longitude: -0.2 },
      status: 'approved',
    },
  ],
};

const BUYERS = {
  message: 'Buyers retrieved',
  data: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: null,
      email: 'kofi@example.com',
      phone: '0241234567',
      profilePicture: null,
      joined: '2026-03-04T09:30:00.000Z',
      status: 'active',
    },
  ],
};

const LISTINGS = {
  message: 'Listings retrieved',
  data: [
    {
      id: 'cccccccc-1111-4111-8111-111111111111',
      product: 'Kente cloth',
      seller: 'Makola Fabrics',
      location: { latitude: 5.55, longitude: -0.2 },
      date: '2026-05-06T11:00:00.000Z',
      status: 'pending',
      image: null,
    },
  ],
};

/** Drives the guarded admin routes over HTTP to check who gets through. */
describe('guarded admin routes', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      controllers: [AdminController],
      providers: [
        AdminService,
        { provide: ConfigService, useValue: { get: () => SECRET } },
        { provide: DashboardService, useValue: { totals: () => TOTALS } },
        { provide: SellersService, useValue: { list: () => SELLERS } },
        { provide: BuyersService, useValue: { list: () => BUYERS } },
        { provide: ListingsService, useValue: { list: () => LISTINGS } },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    jwt = module.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  const get = async (token?: string, path = '/admin/dashboard') => {
    const call = request(app.getHttpServer()).get(path);
    const res = await (token
      ? call.set('Authorization', `Bearer ${token}`)
      : call);

    return { status: res.status, body: res.body as Envelope };
  };

  const tokenFor = (role: JwtPayload['role']) =>
    jwt.sign({ sub: 'someone', role } satisfies JwtPayload);

  it('200 with the totals for an admin token', async () => {
    const { status, body } = await get(tokenFor('ADMIN'));

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, data: TOTALS.data });
  });

  it('401 with no token at all', async () => {
    const { status, body } = await get();

    expect(status).toBe(401);
    expect(body.message).toBe('Authentication token is missing');
  });

  it('401 on a token signed with the wrong secret', async () => {
    const forged = new JwtService({ secret: 'not-the-secret' }).sign({
      sub: 'someone',
      role: 'ADMIN',
    });

    expect((await get(forged)).status).toBe(401);
  });

  it('403 for a signed-in buyer', async () => {
    const { status, body } = await get(tokenFor('BUYER'));

    expect(status).toBe(403);
    expect(body.message).toContain('ADMIN');
  });

  it('403 for a signed-in seller', async () => {
    expect((await get(tokenFor('SELLER'))).status).toBe(403);
  });

  it('200 with the sellers list for an admin token', async () => {
    const { status, body } = await get(tokenFor('ADMIN'), '/admin/sellers');

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, data: SELLERS.data });
  });

  it('403 on the sellers list for a signed-in buyer', async () => {
    expect((await get(tokenFor('BUYER'), '/admin/sellers')).status).toBe(403);
  });

  it('401 on the sellers list with no token', async () => {
    expect((await get(undefined, '/admin/sellers')).status).toBe(401);
  });

  it('200 with the buyers list for an admin token', async () => {
    const { status, body } = await get(tokenFor('ADMIN'), '/admin/buyers');

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, data: BUYERS.data });
  });

  it('403 on the buyers list for a signed-in seller', async () => {
    expect((await get(tokenFor('SELLER'), '/admin/buyers')).status).toBe(403);
  });

  it('401 on the buyers list with no token', async () => {
    expect((await get(undefined, '/admin/buyers')).status).toBe(401);
  });

  it('200 with the listings for an admin token', async () => {
    const { status, body } = await get(tokenFor('ADMIN'), '/admin/listings');

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, data: LISTINGS.data });
  });

  it('403 on the listings for a signed-in buyer', async () => {
    expect((await get(tokenFor('BUYER'), '/admin/listings')).status).toBe(403);
  });

  it('401 on the listings with no token', async () => {
    expect((await get(undefined, '/admin/listings')).status).toBe(401);
  });
});
