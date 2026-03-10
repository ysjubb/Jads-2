import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../env'

// Extend Express Request with typed auth payloads
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId:            string
        role:              string
        userType:          'CIVILIAN' | 'SPECIAL'
        entityCode?:       string
        specialUserId?:    string
        credentialDomain?: 'AIRCRAFT' | 'DRONE'
      }
      adminAuth?: {
        adminUserId: string
        adminRole:   string
      }
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'MISSING_AUTH_HEADER' })
    return
  }
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as Record<string, unknown>
    req.auth = {
      userId:           payload.userId           as string,
      role:             payload.role             as string,
      userType:         payload.userType         as 'CIVILIAN' | 'SPECIAL',
      entityCode:       payload.entityCode       as string | undefined,
      specialUserId:    payload.specialUserId    as string | undefined,
      credentialDomain: payload.credentialDomain as 'AIRCRAFT' | 'DRONE' | undefined,
    }
    next()
  } catch {
    res.status(401).json({ error: 'INVALID_OR_EXPIRED_TOKEN' })
  }
}

// Enforce credential domain — AIRCRAFT users cannot access drone endpoints and vice versa.
// PLATFORM_SUPER_ADMIN bypasses domain restrictions.
export function requireDomain(domain: 'AIRCRAFT' | 'DRONE') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) { res.status(401).json({ error: 'UNAUTHENTICATED' }); return }
    if (req.auth.role === 'PLATFORM_SUPER_ADMIN') { next(); return }
    if (req.auth.credentialDomain !== domain) {
      res.status(403).json({
        error:    'DOMAIN_MISMATCH',
        message:  `This endpoint requires ${domain} domain credentials`,
        required: domain,
        actual:   req.auth.credentialDomain ?? 'UNKNOWN',
      })
      return
    }
    next()
  }
}

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) { res.status(401).json({ error: 'UNAUTHENTICATED' }); return }
    if (!allowedRoles.includes(req.auth.role)) {
      res.status(403).json({ error: 'INSUFFICIENT_ROLE', required: allowedRoles })
      return
    }
    next()
  }
}

// Enforces X-JADS-Version: 4.0 on all /api routes
export function versionHeaderMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-jads-version'] !== env.JADS_VERSION) {
    res.status(400).json({
      error:    'MISSING_OR_WRONG_VERSION_HEADER',
      required: `X-JADS-Version: ${env.JADS_VERSION}`,
    })
    return
  }
  next()
}

// requireAuditAuth — accepts EITHER:
//   (A) Admin JWT (signed with ADMIN_JWT_SECRET) — for audit portal login via /api/admin/login
//   (B) Civilian/Special JWT (signed with JWT_SECRET) — for future direct auditor accounts
//
// When an admin JWT is accepted, req.auth is populated from the admin payload so
// requireRole() and AuditService scope checks work without modification.
export function requireAuditAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'MISSING_AUTH_HEADER' })
    return
  }
  const token = header.slice(7)

  // Try admin JWT first
  try {
    const payload = jwt.verify(token, env.ADMIN_JWT_SECRET) as Record<string, unknown>
    // Map admin payload to req.auth so downstream middleware works
    req.auth = {
      userId:    payload.adminUserId as string,
      role:      payload.adminRole   as string,
      userType:  'SPECIAL',
      entityCode: undefined,
    }
    req.adminAuth = {
      adminUserId: payload.adminUserId as string,
      adminRole:   payload.adminRole   as string,
    }
    next()
    return
  } catch { /* not an admin token — try civilian */ }

  // Try civilian/special JWT
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as Record<string, unknown>
    req.auth = {
      userId:           payload.userId           as string,
      role:             payload.role             as string,
      userType:         payload.userType         as 'CIVILIAN' | 'SPECIAL',
      entityCode:       payload.entityCode       as string | undefined,
      specialUserId:    payload.specialUserId    as string | undefined,
      credentialDomain: payload.credentialDomain as 'AIRCRAFT' | 'DRONE' | undefined,
    }
    next()
  } catch {
    res.status(401).json({ error: 'INVALID_OR_EXPIRED_TOKEN' })
  }
}
