export {};

export interface IAdminClaims {
  exp?: number;
  iat?: number;
  sub?: string;
}

declare global {
  namespace Express {
    interface Request {
      safePath: string;
      admin: IAdminClaims;
    }
  }
}
