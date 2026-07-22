export interface JwtUser {
  id: string;
  username: string;
  role: 'admin' | 'client';
}

export interface ApiKeyClient {
  id: string;
  username: string;
  isActive: boolean | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtUser;
      client?: ApiKeyClient;
    }
  }
}
