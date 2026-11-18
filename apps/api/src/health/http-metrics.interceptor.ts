import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';

const BUFFER_SIZE = 1000;

export interface HttpMetrics {
  requestsTotal: number;
  errorsTotal: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  uptime: number;
}

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  private requestsTotal = 0;
  private errorsTotal = 0;
  private latencies: number[] = [];

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    this.requestsTotal++;

    return next.handle().pipe(
      tap(() => {
        this.recordLatency(Date.now() - start);
      }),
      catchError((err) => {
        this.errorsTotal++;
        this.recordLatency(Date.now() - start);
        return throwError(() => err);
      }),
    );
  }

  private recordLatency(ms: number): void {
    this.latencies.push(ms);
    if (this.latencies.length > BUFFER_SIZE) {
      this.latencies.shift();
    }
  }

  getMetrics(): HttpMetrics {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const avg =
      sorted.length > 0
        ? sorted.reduce((sum, v) => sum + v, 0) / sorted.length
        : 0;
    const p95 =
      sorted.length > 0
        ? (sorted[Math.floor(sorted.length * 0.95)] ??
          sorted[sorted.length - 1])
        : 0;

    return {
      requestsTotal: this.requestsTotal,
      errorsTotal: this.errorsTotal,
      errorRate:
        this.requestsTotal > 0 ? this.errorsTotal / this.requestsTotal : 0,
      avgLatencyMs: Math.round(avg * 100) / 100,
      p95LatencyMs: p95,
      uptime: process.uptime(),
    };
  }
}
