import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type AuthPayload = {
  sub: number;
  email: string;
  userType: 'TECH' | 'CLIENT';
};

export type AuthRequest = Request & { user?: AuthPayload };

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Missing authorization token' });
    return;
  }

  const token = header.replace('Bearer ', '').trim();

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);

    if (typeof payload !== 'object' || payload === null) {
      res.status(401).json({ message: 'Invalid or expired token' });
      return;
    }

    const subValue = payload.sub;
    const parsedSub =
      typeof subValue === 'number'
        ? subValue
        : typeof subValue === 'string'
          ? Number(subValue)
          : Number.NaN;

    const email = typeof payload.email === 'string' ? payload.email : null;
    const rawUserType = typeof payload.userType === 'string' ? payload.userType.toUpperCase() : null;

    if (Number.isNaN(parsedSub) || !email || (rawUserType !== 'TECH' && rawUserType !== 'CLIENT')) {
      res.status(401).json({ message: 'Invalid or expired token' });
      return;
    }

    req.user = {
      sub: parsedSub,
      email,
      userType: rawUserType
    };
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
