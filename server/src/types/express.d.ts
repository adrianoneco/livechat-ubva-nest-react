declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: 'admin' | 'supervisor' | 'agent';
      };
    }
  }
}

export {};


