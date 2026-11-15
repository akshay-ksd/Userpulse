import {
  StandardSchemaValidationPipe,
  type INestApplication,
} from '@nestjs/common';

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableCors({
    origin(
      requestOrigin: string | undefined,
      callback: (err: Error | null, origin?: string | boolean) => void,
    ) {
      if (!requestOrigin || requestOrigin === WEB_ORIGIN) {
        callback(null, requestOrigin || WEB_ORIGIN);
      } else {
        callback(null, requestOrigin);
      }
    },
    credentials: true,
  });
  app.enableCsrfProtection({
    trustedOrigins: [WEB_ORIGIN],
    exclude: (req: { url?: string }) =>
      req.url?.startsWith('/v1/events') ?? false,
  });
}
