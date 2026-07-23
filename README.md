# 🃏 牌局大厅 Poker Lobby

全栈扑克游戏大厅：内置多种扑克玩法（当前已上线**斗地主**），支持**多人联机**与**单人 AI 对战**。

- 前端：React 18 + TypeScript + Vite（Socket.IO 客户端）
- 后端：NestJS 11 + **Fastify** + Socket.IO
- AI：**Vercel AI SDK**（`ai` + `@ai-sdk/openai-compatible`）编排，默认对接火山方舟（Ark）
  OpenAI 兼容端点；未配置 API Key 时自动降级为内置规则 AI，离线可玩

## 快速开始

```bash
npm install

# 可选：配置大模型 AI（不配置则使用内置规则 AI）
cp server/.env.example server/.env   # 填入 ARK_API_KEY

npm run dev        # 同时启动 server(:3001) 与 client(:5173)
```

浏览器打开 http://localhost:5173 。多人联机：开两个浏览器窗口，一个创建多人房间、另一个加入。

生产构建与运行（服务端托管前端产物，单端口 3001）：

```bash
npm run build
npm start
```

测试（牌型识别 / 比较 / 枚举 + 机器人自对弈 30 局冒烟）：

```bash
npm run build -w server && npm test
```

## AI 配置

`server/.env`：

| 变量 | 说明 | 默认 |
|---|---|---|
| `ARK_API_KEY` | 方舟 API Key，留空则使用规则 AI | 空 |
| `ARK_BASE_URL` | OpenAI 兼容端点 | `https://ark.cn-beijing.volces.com/api/v3` |
| `ARK_MODEL` | 推理接入点/模型 ID | `doubao-seed-2-1-turbo-260628` |
| `AI_TIMEOUT_MS` | 单次决策超时（超时降级规则 AI） | `20000` |

AI 编排通过 Vercel AI SDK 的 `openai-compatible` provider 实现，**不绑定供应商**：
换 `ARK_BASE_URL`/`ARK_MODEL` 即可切到 OpenAI、DeepSeek、通义、本地 vLLM 等任何
OpenAI 协议兼容服务；也可在 `server/src/ai/llm.service.ts` 中换成
`@ai-sdk/anthropic` 等官方 provider。

## 工程结构与扩展新玩法

```
server/src/
  ai/llm.service.ts            通用 LLM 服务（供应商无关）
  games/game.interface.ts      玩法抽象：GameDefinition / Match / GameAction / MatchAi
  games/games.registry.ts      玩法注册表（大厅目录）
  games/doudizhu/              斗地主实现
    cards.ts                   牌编码 / 排序 / 洗牌
    combos.ts                  牌型识别 · 比较 · 合法出牌枚举
    engine.ts                  对局状态机（叫分/出牌/春天/倍数/计分）
    rule-bot.ts                规则 AI（兜底策略）
    doudizhu.definition.ts     接入插件层 + LLM AI（候选枚举 → LLM 选择 → 规则兜底）
    engine.spec.ts             单元测试 + 自对弈冒烟
  rooms/                       房间管理（建房/加入/AI 补位/断线 AI 接管）与 Socket.IO 网关
  lobby/                       大厅 REST API（/api/games /api/rooms /api/status）

client/src/
  design/tokens.css            设计令牌（UI/UX 规范的单一来源）
  styles/{base,cards,table}.css 模块化样式：基础控件 / 牌面 / 牌桌（可按设计稿逐个替换）
  ui/                          基础控件库（Button/Input/Panel/Badge/Segmented/Modal/Toast）
  components/PlayingCard.tsx   扑克牌牌面组件
  pages/                       大厅 / 等待房间 / 设计规范展示页（#/design）
  games/doudizhu/              斗地主牌桌
```

**新增玩法**（如德州扑克、斗地主癞子场/天地癞）：

1. `server/src/games/<game>/` 实现引擎，并实现 `GameDefinition`（`createMatch` /
   `createAi` / 元信息）；斗地主变体可复用现有引擎 + `DoudizhuRules` 规则参数
   （`variant: 'laizi' | 'tiandilai'`，癞子在 combos 层做通配展开）。
2. 在 `games.registry.ts` 的 `buildDefinitions()` 注册。
3. 客户端在 `client/src/games/<game>/` 添加牌桌组件，并在 `App.tsx` 按
   `room.gameId` 分发渲染。

房间、通信（`game:action` 通用透传）、大厅目录、AI 驱动循环均无需改动。

## UI/UX 规范

- 规范文档：[docs/UI-UX-SPEC.md](docs/UI-UX-SPEC.md)
- 在线展示页：应用内访问 `#/design`（基础控件 + 扑克牌牌面）
- 设计令牌集中在 `client/src/design/tokens.css`，对齐设计稿时只需替换 token 与
  对应模块样式文件（`styles/base.css` 基础控件、`styles/cards.css` 牌面、
  `styles/table.css` 牌桌）。
