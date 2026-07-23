import { Module } from '@nestjs/common';
import { LlmService } from './ai/llm.service';
import { GamesRegistry } from './games/games.registry';
import { LobbyController } from './lobby/lobby.controller';
import { RoomManager } from './rooms/room.manager';
import { RoomsGateway } from './rooms/rooms.gateway';

@Module({
  controllers: [LobbyController],
  providers: [LlmService, GamesRegistry, RoomManager, RoomsGateway],
})
export class AppModule {}
