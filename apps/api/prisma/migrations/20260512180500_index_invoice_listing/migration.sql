-- Composite index supporting the default list ordering
-- (issuedAt DESC NULLS LAST, createdAt DESC) when no status filter is set.
CREATE INDEX "Invoice_issuedAt_createdAt_idx" ON "Invoice"("issuedAt" DESC, "createdAt" DESC);
