import { Controller } from '@nestjs/common';
import { SavedService } from './saved.service';

@Controller('saved')
export class SavedController {
  constructor(private readonly savedService: SavedService) {}
}
