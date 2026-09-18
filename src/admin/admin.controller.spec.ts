import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

describe('AdminController', () => {
  let controller: AdminController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      getDashboard: jest.fn(),
      listUsers: jest.fn(),
      searchUsers: jest.fn(),
      getUser: jest.fn(),
      updateUserStatus: jest.fn(),
      listBuyers: jest.fn(),
      getBuyer: jest.fn(),
      listSellers: jest.fn(),
      listPendingSellers: jest.fn(),
      getSeller: jest.fn(),
      approveSeller: jest.fn(),
      rejectSeller: jest.fn(),
      listListings: jest.fn(),
      listPendingListings: jest.fn(),
      getListing: jest.fn(),
      approveListing: jest.fn(),
      rejectListing: jest.fn(),
      removeListing: jest.fn(),
      listReports: jest.fn(),
      resolveReport: jest.fn(),
      dismissReport: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: service }],
    })
      // The guards are exercised in their own specs; here they are stubbed
      // out so the routing and delegation can be checked in isolation.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminController);
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('is restricted to admins', () => {
    const roles = new Reflector().get<string[]>(ROLES_KEY, AdminController);
    expect(roles).toEqual(['ADMIN']);
  });

  it('passes the whole query object to the search, not just the term', () => {
    const query = { q: 'ama', role: 'BUYER' as const, page: 2 };
    void controller.searchUser(query);

    expect(service.searchUsers).toHaveBeenCalledWith(query);
  });

  it('unwraps the status DTO and passes the acting admin', () => {
    void controller.updateUserStatus(
      'u1',
      { status: 'suspended' },
      { sub: 'admin-1', role: 'ADMIN' },
    );

    expect(service.updateUserStatus).toHaveBeenCalledWith(
      'u1',
      'suspended',
      'admin-1',
    );
  });

  it.each(['resolveReport', 'dismissReport'] as const)(
    '%s records the acting admin',
    (route) => {
      void controller[route]('r1', { sub: 'admin-1', role: 'ADMIN' });

      expect(service[route]).toHaveBeenCalledWith('r1', 'admin-1');
    },
  );

  it.each([
    ['dashboard', [], 'getDashboard'],
    ['getUsers', [{}], 'listUsers'],
    ['getOneUser', ['u1'], 'getUser'],
    ['getBuyers', [{}], 'listBuyers'],
    ['getOneBuyer', ['b1'], 'getBuyer'],
    ['getSellers', [{}], 'listSellers'],
    ['getPendingSellers', [{}], 'listPendingSellers'],
    ['getOneSeller', ['s1'], 'getSeller'],
    ['approveSeller', ['s1'], 'approveSeller'],
    ['rejectSeller', ['s1'], 'rejectSeller'],
    ['getListings', [{}], 'listListings'],
    ['getPendingListings', [{}], 'listPendingListings'],
    ['getOneListing', ['l1'], 'getListing'],
    ['approveListing', ['l1'], 'approveListing'],
    ['rejectListing', ['l1'], 'rejectListing'],
    ['removeListing', ['l1'], 'removeListing'],
    ['getReports', [{}], 'listReports'],
  ])('%s delegates to AdminService.%s', (route, args, method) => {
    (
      controller[route as keyof AdminController] as (...a: unknown[]) => unknown
    )(...args);

    expect(service[method]).toHaveBeenCalledWith(...args);
  });
});
