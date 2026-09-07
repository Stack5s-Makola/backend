import { Test, TestingModule } from '@nestjs/testing';
import { SavedController } from './saved.controller';
import { SavedService } from './saved.service';

describe('SavedController', () => {
  let controller: SavedController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SavedController],
      providers: [SavedService],
    }).compile();

    controller = module.get<SavedController>(SavedController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
