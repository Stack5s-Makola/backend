import { Test, TestingModule } from '@nestjs/testing';
import { SavedService } from './saved.service';

describe('SavedService', () => {
  let service: SavedService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SavedService],
    }).compile();

    service = module.get<SavedService>(SavedService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
