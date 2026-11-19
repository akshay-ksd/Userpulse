import {
  RequestMethod,
  StandardSchemaValidationPipe,
  type INestApplication,
} from '@nestjs/common';

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const EXTRA_ORIGINS = process.env.EXTRA_TRUSTED_ORIGINS?.split(',').filter(Boolean) ?? [];

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, true);
    },
    credentials: true,
  });
  app.enableCsrfProtection({
    trustedOrigins: [WEB_ORIGIN, ...EXTRA_ORIGINS],
    exclude: [{ path: 'v1/events', method: RequestMethod.POST }],
  });
}
