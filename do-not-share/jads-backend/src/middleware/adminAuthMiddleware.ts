import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../env'

// Admin tokens are signed with ADMIN_JWT_SECRET — never JWT_SECRET.
// A compromised user token cannot reach admin routes.
export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'MISSING_ADMIN_AUTH_HEADER' })
    return
  }
  try {
    const payload = jwt.verify(header.slice(7), env.ADMIN_JWT_SECRET) as Record<string, unknown>
    req.adminAuth = {
      adminUserId: payload.adminUserId as string,
      adminRole:   payload.adminRole   as string,
    }
    next()
  } catch {
    res.status(401).json({ error: 'INVALID_OR_EXPIRED_ADMIN_TOKEN' })
  }
}

export function requireAdminRole(requiredRole: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.adminAuth) { res.status(401).json({ error: 'UNAUTHENTICATED' }); return }
    // PLATFORM_SUPER_ADMIN bypasses all role checks
    if (req.adminAuth.adminRole === 'PLATFORM_SUPER_ADMIN') { next(); return }
    if (req.adminAuth.adminRole !== requiredRole) {
      res.status(403).json({ error: 'INSUFFICIENT_ADMIN_ROLE', required: requiredRole })
      return
    }
    next()
  }
}
