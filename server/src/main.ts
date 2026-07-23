import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  app.enableCors({ origin: true });
  app.setGlobalPrefix('api');

  // 生产模式下托管前端构建产物（client/dist），开发时由 Vite 代理
  const clientDist = join(__dirname, '..', '..', 'client', 'dist');
  if (existsSync(clientDist)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fastifyStatic = require('@fastify/static');
    await app.register(fastifyStatic, { root: clientDist, wildcard: false });
    const fastify = app.getHttpAdapter().getInstance();
    // SPA 回退：非 API/静态资源路径一律返回 index.html
    fastify.get('/*', (req: any, reply: any) => {
      if (req.raw.url?.startsWith('/api')) {
        reply.code(404).send({ error: 'Not Found' });
      } else {
        reply.sendFile('index.html');
      }
    });
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`🃏 poker-game server listening on http://localhost:${port}`);
}

bootstrap();
