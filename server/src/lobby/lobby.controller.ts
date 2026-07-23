import { Controller, Get } from '@nestjs/common';
import { GamesRegistry } from '../games/games.registry';
import { LlmService } from '../ai/llm.service';
import { RoomManager } from '../rooms/room.manager';

@Controller()
export class LobbyController {
  constructor(
    private readonly registry: GamesRegistry,
    private readonly llm: LlmService,
    private readonly rooms: RoomManager,
  ) {}

  @Get('games')
  games() {
    return { games: this.registry.catalog() };
  }

  @Get('rooms')
  roomList() {
    return { rooms: this.rooms.listRooms() };
  }

  @Get('status')
  status() {
    return {
      ok: true,
      // llm=true 表示单人 AI 使用大模型；false 表示使用内置规则 AI
      llm: this.llm.enabled,
    };
  }
}
