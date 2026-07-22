import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodType, ZodError } from 'zod';

function formatIssues(error: ZodError) {
  return error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));
}

// Parses+replaces req.body with the schema's output (so routes get trimmed/coerced values),
// or responds 400 with a field-by-field error list.
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid request body.', details: formatIssues(result.error) });
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid query parameters.', details: formatIssues(result.error) });
    }
    // req.query is technically read-only in the Express type, but reassigning the parsed
    // values back onto it (rather than replacing the object) keeps existing req.query.x reads
    // in route handlers working unchanged.
    Object.assign(req.query, result.data);
    next();
  };
}
