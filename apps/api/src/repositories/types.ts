import type { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;
