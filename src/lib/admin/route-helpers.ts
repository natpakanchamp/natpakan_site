import { z } from 'zod';
import { GithubConflictError } from './github';
import { json } from './handler';
import { PostNotFoundError } from './posts-service';

/** Parse a JSON body against a schema, or return a 400 Response describing the first problems. */
export async function readJson<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T> | Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'body'}: ${i.message}`);
    return json(400, { error: 'ข้อมูลไม่ถูกต้อง', issues });
  }
  return parsed.data;
}

/** Map known domain errors to HTTP responses; rethrow anything else for withAdmin to log. */
export function domainErrorResponse(error: unknown): Response {
  if (error instanceof PostNotFoundError) return json(404, { error: 'ไม่พบโพสต์นี้' });
  if (error instanceof GithubConflictError) {
    return json(409, { error: 'โพสต์นี้ถูกแก้ไขจากที่อื่นหรือมีชื่อซ้ำ โหลดหน้าใหม่แล้วลองอีกครั้ง' });
  }
  throw error;
}
