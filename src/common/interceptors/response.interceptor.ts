import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiSuccessResponse } from '../interfaces/api-response';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<unknown> | T
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<unknown> | T> {
    return next.handle().pipe(
      map((body) => {
        if (
          body !== null &&
          typeof body === 'object' &&
          'success' in (body as object)
        ) {
          return body;
        }

        if (
          body !== null &&
          typeof body === 'object' &&
          'data' in (body as object)
        ) {
          const shaped = body as unknown as {
            data: unknown;
            meta?: Record<string, unknown>;
          };
          const response: ApiSuccessResponse<unknown> = {
            success: true,
            data: shaped.data,
          };
          if (shaped.meta !== undefined) {
            response.meta = shaped.meta;
          }
          return response;
        }

        return {
          success: true,
          data: body,
        } satisfies ApiSuccessResponse<T>;
      }),
    );
  }
}
