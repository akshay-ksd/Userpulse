import {
  StandardSchemaValidationPipe,
  type INestApplication,
} from '@nestjs/common';

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableCors({
    origin: WEB_ORIGIN,
    credentials: true,
  });
  // Refuse cross-origin state-changing requests from anywhere but the web app.
  app.enableCsrfProtection({ trustedOrigins: [WEB_ORIGIN] });
}
