// Shared PrismaClient singleton — avoids connection pool exhaustion from
// multiple instances across route files and services.

import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()
