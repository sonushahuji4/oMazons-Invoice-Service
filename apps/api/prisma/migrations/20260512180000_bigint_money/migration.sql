-- Widen money columns from INTEGER (Int32) to BIGINT (Int64) so high-value
-- invoices (above ~$21.47M / ₹21.47M minor-unit cap of Int32) commit cleanly.
ALTER TABLE "Invoice"
  ALTER COLUMN "subtotalMinor" SET DATA TYPE BIGINT,
  ALTER COLUMN "taxMinor"      SET DATA TYPE BIGINT,
  ALTER COLUMN "totalMinor"    SET DATA TYPE BIGINT;

ALTER TABLE "LineItem"
  ALTER COLUMN "unitPriceMinor" SET DATA TYPE BIGINT;
