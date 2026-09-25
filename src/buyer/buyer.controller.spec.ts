import { INestApplication, NotFoundException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { JwtPayload } from '../common/guards/jwt-auth.guard';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { validationPipe } from '../common/validation';
import { BuyerController } from './buyer.controller';
import { BuyerService } from './buyer.service';

const SECRET = 'test-secret';

/** The envelope the response interceptor and exception filter both emit. */
interface Envelope {
  success: boolean;
  message: string;
  data: unknown;
  errors?: Record<string, string>;
}

const PRODUCTS = {
  message: 'Products retrieved',
  data: [
    {
      id: 'cccccccc-1111-4111-8111-111111111111',
      name: 'Kente cloth',
      price: 250,
      image: null,
      seller: { id: 'bbbb', shopName: 'Makola Fabrics' },
      location: { latitude: 5.575, longitude: -0.2 },
      listedAt: '2026-05-06T11:00:00.000Z',
    },
  ],
};

describe('GET /buyer/products', () => {
  const browse = jest.fn();
  const search = jest.fn();
  const savedProductsFor = jest.fn();
  const savedShopsFor = jest.fn();
  const product = jest.fn();
  const profile = jest.fn();
  const personalDetails = jest.fn();
  const nearbyShops = jest.fn();
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      controllers: [BuyerController],
      providers: [
        {
          provide: BuyerService,
          useValue: {
            browse,
            search,
            savedProductsFor,
            savedShopsFor,
            product,
            profile,
            personalDetails,
            nearbyShops,
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(validationPipe);
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    jwt = module.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    browse.mockResolvedValue(PRODUCTS);
    search.mockResolvedValue(PRODUCTS);
    savedProductsFor.mockResolvedValue({
      message: 'Saved products retrieved',
      data: PRODUCTS.data,
    });
    savedShopsFor.mockResolvedValue({
      message: 'Saved shops retrieved',
      data: [],
    });
    product.mockResolvedValue({
      message: 'Product retrieved',
      data: PRODUCTS.data[0],
    });
    profile.mockResolvedValue({
      message: 'Profile retrieved',
      data: { name: null, profilePicture: null, email: 'kofi@example.com' },
    });
    nearbyShops.mockResolvedValue({
      message: 'Shops retrieved',
      data: [],
    });
    personalDetails.mockResolvedValue({
      message: 'Personal details retrieved',
      data: { id: 'user-a', email: 'kofi@example.com' },
    });
  });

  const tokenFor = (role: JwtPayload['role'], sub = 'someone') =>
    jwt.sign({ sub, role } satisfies JwtPayload);

  const get = async (token?: string, query = '', path = '/buyer/products') => {
    const call = request(app.getHttpServer()).get(`${path}${query}`);
    const res = await (token
      ? call.set('Authorization', `Bearer ${token}`)
      : call);

    return { status: res.status, body: res.body as Envelope };
  };

  it('200 with the products for a signed-in buyer', async () => {
    const { status, body } = await get(tokenFor('BUYER'));

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, data: PRODUCTS.data });
  });

  it('200 for a seller too - browsing is not role restricted', async () => {
    expect((await get(tokenFor('SELLER'))).status).toBe(200);
  });

  it('401 with no token', async () => {
    const { status, body } = await get();

    expect(status).toBe(401);
    expect(body.message).toBe('Authentication token is missing');
  });

  it('401 on a token signed with the wrong secret', async () => {
    const forged = new JwtService({ secret: 'not-the-secret' }).sign({
      sub: 'someone',
      role: 'BUYER',
    });

    expect((await get(forged)).status).toBe(401);
  });

  it('passes coordinates through as numbers', async () => {
    await get(tokenFor('BUYER'), '?latitude=5.55&longitude=-0.2&radiusKm=10');

    expect(browse).toHaveBeenCalledWith({
      latitude: 5.55,
      longitude: -0.2,
      radiusKm: 10,
    });
  });

  it('accepts no query at all', async () => {
    await get(tokenFor('BUYER'));

    expect(browse).toHaveBeenCalledWith({});
  });

  it('400 on a latitude out of range', async () => {
    const { status, body } = await get(tokenFor('BUYER'), '?latitude=999');

    expect(status).toBe(400);
    expect(body.errors?.latitude).toContain('between -90 and 90');
  });

  it('400 on a negative radius', async () => {
    const { status, body } = await get(
      tokenFor('BUYER'),
      '?latitude=5.55&longitude=-0.2&radiusKm=-5',
    );

    expect(status).toBe(400);
    expect(body.errors?.radiusKm).toContain('greater than 0');
  });

  it('passes a category through', async () => {
    await get(tokenFor('BUYER'), '?category=Fabrics');

    expect(browse).toHaveBeenCalledWith({ category: 'Fabrics' });
  });

  it('trims a category with stray spaces', async () => {
    await get(tokenFor('BUYER'), '?category=%20Fabrics%20');

    expect(browse).toHaveBeenCalledWith({ category: 'Fabrics' });
  });

  it('200 on a search, passing the term through', async () => {
    const { status } = await get(
      tokenFor('BUYER'),
      '?q=kente',
      '/buyer/products/search',
    );

    expect(status).toBe(200);
    expect(search).toHaveBeenCalledWith({ q: 'kente' });
  });

  it('400 when a search has no term', async () => {
    const { status, body } = await get(
      tokenFor('BUYER'),
      '',
      '/buyer/products/search',
    );

    expect(status).toBe(400);
    expect(body.errors).toHaveProperty('q');
  });

  it('400 when a search term is only spaces', async () => {
    const res = await get(
      tokenFor('BUYER'),
      '?q=%20%20',
      '/buyer/products/search',
    );

    expect(res.status).toBe(400);
  });

  it('401 on a search with no token', async () => {
    const { status } = await get(
      undefined,
      '?q=kente',
      '/buyer/products/search',
    );

    expect(status).toBe(401);
  });

  it('takes a search term with a category and coordinates together', async () => {
    await get(
      tokenFor('BUYER'),
      '?q=kente&category=Fabrics&latitude=5.55&longitude=-0.2&radiusKm=10',
      '/buyer/products/search',
    );

    expect(search).toHaveBeenCalledWith({
      q: 'kente',
      category: 'Fabrics',
      latitude: 5.55,
      longitude: -0.2,
      radiusKm: 10,
    });
  });

  it('200 with the saved products', async () => {
    const { status, body } = await get(
      tokenFor('BUYER'),
      '',
      '/buyer/saved/products',
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, data: PRODUCTS.data });
  });

  it('200 with the saved shops', async () => {
    const { status, body } = await get(
      tokenFor('BUYER'),
      '',
      '/buyer/saved/shops',
    );

    expect(status).toBe(200);
    expect(body.message).toBe('Saved shops retrieved');
  });

  it('reads whose saves from the token, not a parameter', async () => {
    await get(tokenFor('BUYER', 'user-a'), '', '/buyer/saved/products');

    expect(savedProductsFor).toHaveBeenCalledWith('user-a');
  });

  it('cannot be pointed at someone else with a query string', async () => {
    await get(
      tokenFor('BUYER', 'user-a'),
      '?userId=user-b',
      '/buyer/saved/products',
    );

    expect(savedProductsFor).toHaveBeenCalledWith('user-a');
  });

  it('401 on saved products with no token', async () => {
    expect((await get(undefined, '', '/buyer/saved/products')).status).toBe(
      401,
    );
  });

  it('401 on saved shops with no token', async () => {
    expect((await get(undefined, '', '/buyer/saved/shops')).status).toBe(401);
  });

  const UUID = 'cccccccc-1111-4111-8111-111111111111';

  it('200 with one product by id', async () => {
    const { status, body } = await get(
      tokenFor('BUYER'),
      '',
      `/buyer/products/${UUID}`,
    );

    expect(status).toBe(200);
    expect(body.message).toBe('Product retrieved');
    expect(product).toHaveBeenCalledWith(UUID);
  });

  it('400 when the product id is not a uuid', async () => {
    const { status } = await get(
      tokenFor('BUYER'),
      '',
      '/buyer/products/not-a-uuid',
    );

    expect(status).toBe(400);
  });

  it('404 when nothing has that id', async () => {
    product.mockRejectedValue(
      new NotFoundException('No product found for that id'),
    );

    const { status, body } = await get(
      tokenFor('BUYER'),
      '',
      `/buyer/products/${UUID}`,
    );

    expect(status).toBe(404);
    expect(body.message).toBe('No product found for that id');
  });

  it('still routes /products/search, not as an id', async () => {
    const { status } = await get(
      tokenFor('BUYER'),
      '?q=kente',
      '/buyer/products/search',
    );

    expect(status).toBe(200);
    expect(search).toHaveBeenCalled();
    expect(product).not.toHaveBeenCalled();
  });

  it('401 on a product page with no token', async () => {
    expect((await get(undefined, '', `/buyer/products/${UUID}`)).status).toBe(
      401,
    );
  });

  it('200 on my-profile, read from the token', async () => {
    const { status } = await get(
      tokenFor('BUYER', 'user-a'),
      '',
      '/buyer/my-profile',
    );

    expect(status).toBe(200);
    expect(profile).toHaveBeenCalledWith('user-a');
  });

  it('200 on personal details, read from the token', async () => {
    const { status } = await get(
      tokenFor('BUYER', 'user-a'),
      '',
      '/buyer/my-profile/personal-details',
    );

    expect(status).toBe(200);
    expect(personalDetails).toHaveBeenCalledWith('user-a');
  });

  it('cannot read someone else s profile with a query string', async () => {
    await get(
      tokenFor('BUYER', 'user-a'),
      '?userId=user-b',
      '/buyer/my-profile',
    );

    expect(profile).toHaveBeenCalledWith('user-a');
  });

  it('401 on my-profile with no token', async () => {
    expect((await get(undefined, '', '/buyer/my-profile')).status).toBe(401);
  });

  it('200 on nearby shops, passing coordinates as numbers', async () => {
    const { status } = await get(
      tokenFor('BUYER'),
      '?latitude=5.55&longitude=-0.2&radiusKm=10',
      '/buyer/shops/nearby',
    );

    expect(status).toBe(200);
    expect(nearbyShops).toHaveBeenCalledWith({
      latitude: 5.55,
      longitude: -0.2,
      radiusKm: 10,
    });
  });

  it('400 when nearby shops gets no coordinates', async () => {
    const { status, body } = await get(
      tokenFor('BUYER'),
      '',
      '/buyer/shops/nearby',
    );

    expect(status).toBe(400);
    expect(body.errors).toHaveProperty('latitude');
  });

  it('400 when a nearby latitude is out of range', async () => {
    const { status } = await get(
      tokenFor('BUYER'),
      '?latitude=999&longitude=-0.2',
      '/buyer/shops/nearby',
    );

    expect(status).toBe(400);
  });

  it('401 on nearby shops with no token', async () => {
    const { status } = await get(
      undefined,
      '?latitude=5.55&longitude=-0.2',
      '/buyer/shops/nearby',
    );

    expect(status).toBe(401);
  });
});
