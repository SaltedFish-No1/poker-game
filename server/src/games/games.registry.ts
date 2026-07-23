import { Injectable } from '@nestjs/common';
import { LlmService } from '../ai/llm.service';
import { GameCatalogItem, GameDefinition } from './game.interface';
import { createDoudizhuDefinition } from './doudizhu/doudizhu.definition';

/**
 * 玩法注册表：新增玩法时在 buildDefinitions 中注册即可。
 * catalog 中 available=false 的条目仅在大厅展示“敬请期待”。
 */
@Injectable()
export class GamesRegistry {
  private readonly definitions = new Map<string, GameDefinition>();
  /** 尚未实现、仅做预告的玩法（实现后移入 buildDefinitions 注册即可） */
  private readonly upcoming: GameCatalogItem[] = [
    {
      id: 'doudizhu-laizi', name: '斗地主·癞子场',
      description: '随机指定癞子牌可变身任意牌（王除外），刺激加倍。',
      minPlayers: 3, maxPlayers: 3, available: false,
    },
    {
      id: 'doudizhu-tiandilai', name: '斗地主·天地癞',
      description: '天癞 + 地癞双癞子玩法，炸弹满天飞。',
      minPlayers: 3, maxPlayers: 3, available: false,
    },
    {
      id: 'texas', name: '德州扑克', description: '经典德州扑克，比拼牌力与心理。',
      minPlayers: 2, maxPlayers: 9, available: false,
    },
  ];

  constructor(private readonly llm: LlmService) {
    for (const def of this.buildDefinitions()) {
      this.definitions.set(def.id, def);
    }
  }

  private buildDefinitions(): GameDefinition[] {
    return [createDoudizhuDefinition(this.llm)];
  }

  get(id: string): GameDefinition | undefined {
    return this.definitions.get(id);
  }

  catalog(): GameCatalogItem[] {
    const implemented = [...this.definitions.values()].map(
      ({ id, name, description, minPlayers, maxPlayers, available }) => ({
        id, name, description, minPlayers, maxPlayers, available,
      }),
    );
    return [...implemented, ...this.upcoming];
  }
}
