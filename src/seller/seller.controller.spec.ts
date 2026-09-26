import { INestApplication, NotFoundException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { JwtPayload } from '../common/guards/jwt-auth.guard';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { NotificationsService } from '../notifications/notifications.service';
import { validationPipe } from '../common/validation';
import { SellerController } from './seller.controller';
import { SellerService } from './seller.service';

const SECRET = 'test-secret';
const PRODUCT_ID = 'cccccccc-1111-4111-8111-111111111111';

/** The envelope the response interceptor and exception filter both emit. */
interface Envelope {
  success: boolean;
  message: string;
  data: unknown;
  errors?: Record<string, string>;
}

/**
 * The route wiring for DELETE /api/seller/products/:id.
 *
 * A destructive route is worth covering at this level rather than only in the
 * service: the guard, the uuid pipe and where the caller's identity comes from
 * are all decided here, and none of them show up in a service test.
 */
describe('DELETE /seller/products/:id', () => {
  const deleteProduct = jest.fn();
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      controllers: [SellerController],
      providers: [
        { provide: SellerService, useValue: { deleteProduct } },
        { provide: NotificationsService, useValue: {} },
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
    deleteProduct.mockResolvedValue({
      message: 'Product deleted',
      data: { deleted: true, id: PRODUCT_ID, name: 'Kente cloth' },
    });
  });

  const tokenFor = (sub = 'seller-a') =>
    jwt.sign({ sub, role: 'SELLER' } satisfies JwtPayload);

  const del = async (token?: string, id = PRODUCT_ID) => {
    const call = request(app.getHttpServer()).delete(`/seller/products/${id}`);
    const res = await (token
      ? call.set('Authorization', `Bearer ${token}`)
      : call);

    return { status: res.status, body: res.body as Envelope };
  };

  it('200 and deletes the listing', async () => {
    const { status, body } = await del(tokenFor());

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, message: 'Product deleted' });
  });

  it('takes whose shop from the token, not the request', async () => {
    await del(tokenFor('seller-a'));

    expect(deleteProduct).toHaveBeenCalledWith('seller-a', PRODUCT_ID);
  });

  it('401 with no token, and deletes nothing', async () => {
    const { status } = await del();

    expect(status).toBe(401);
    expect(deleteProduct).not.toHaveBeenCalled();
  });

  it('400 when the id is not a uuid, and deletes nothing', async () => {
    const { status } = await del(tokenFor(), 'not-a-uuid');

    expect(status).toBe(400);
    expect(deleteProduct).not.toHaveBeenCalled();
  });

  it('404 when the listing is not this seller s', async () => {
    deleteProduct.mockRejectedValue(
      new NotFoundException('No product found in your shop for that id'),
    );

    const { status, body } = await del(tokenFor());

    expect(status).toBe(404);
    expect(body.message).toBe('No product found in your shop for that id');
  });
});
