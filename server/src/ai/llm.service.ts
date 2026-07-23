import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

/**
 * 通用 LLM 文本生成服务（与具体玩法无关）。
 *
 * 编排采用 Vercel AI SDK（provider 无关）：默认通过 openai-compatible
 * provider 对接火山方舟（Ark）的 OpenAI 兼容端点；替换 ARK_BASE_URL /
 * ARK_MODEL 即可切换任何兼容 OpenAI 协议的供应商（OpenAI、DeepSeek、
 * 通义、本地 vLLM 等），也可以换成 @ai-sdk/anthropic 等官方 provider。
 *
 * 未配置 ARK_API_KEY 时 enabled=false，各玩法的 AI 自行降级为规则策略，
 * 保证游戏离线可玩；调用失败/超时返回 null，绝不抛出阻塞对局。
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly apiKey = process.env.ARK_API_KEY ?? '';
  private readonly baseURL =
    process.env.ARK_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/v3';
  private readonly modelId =
    process.env.ARK_MODEL ?? 'doubao-seed-2-1-turbo-260628';
  private readonly timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 20000);

  get enabled(): boolean {
    return this.apiKey.length > 0;
  }

  private model() {
    const provider = createOpenAICompatible({
      name: 'ark',
      baseURL: this.baseURL,
      apiKey: this.apiKey,
    });
    return provider(this.modelId);
  }

  /** 生成文本；未启用或失败时返回 null（调用方降级处理） */
  async complete(prompt: string): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      const { text } = await generateText({
        model: this.model(),
        abortSignal: AbortSignal.timeout(this.timeoutMs),
        prompt,
      });
      return text;
    } catch (err) {
      this.logger.warn(`LLM 调用失败（将降级规则 AI）：${String(err)}`);
      return null;
    }
  }

  /** 从模型输出中解析 {"key": n} 形式的整数，容忍代码块与多余文本 */
  parseIntField(text: string, key: string): number | null {
    const jsonMatch = text.match(new RegExp(`"${key}"\\s*:\\s*(-?\\d+)`));
    if (jsonMatch) return parseInt(jsonMatch[1], 10);
    const bare = text.trim().match(/^-?\d+$/);
    if (bare) return parseInt(bare[0], 10);
    return null;
  }
}
