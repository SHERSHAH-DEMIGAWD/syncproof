CREATE TABLE inspections (
    id uuid PRIMARY KEY,
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    status text NOT NULL CHECK (status IN ('open', 'in_progress', 'complete')),
    notes text NOT NULL CHECK (char_length(notes) <= 8000),
    revision bigint NOT NULL CHECK (revision > 0),
    deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE processed_mutations (
    mutation_id uuid PRIMARY KEY,
    protocol_version integer NOT NULL CHECK (protocol_version = 1),
    client_id uuid NOT NULL,
    -- No inspection FK: a missing-record conflict must also have a receipt.
    record_id uuid NOT NULL,
    operation text NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
    base_revision bigint,
    canonical_request text NOT NULL CHECK (octet_length(canonical_request) BETWEEN 1 AND 65536),
    fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
    outcome text CHECK (outcome IN ('committed', 'conflict')),
    http_status smallint,
    committed_revision bigint CHECK (committed_revision > 0),
    response jsonb,
    processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK ((operation = 'create' AND base_revision IS NULL)
        OR (operation IN ('update', 'delete') AND base_revision > 0 AND base_revision IS NOT NULL)),
    CHECK (
        (outcome IS NULL AND http_status IS NULL AND committed_revision IS NULL AND response IS NULL)
        OR (outcome = 'committed' AND http_status = 200 AND committed_revision IS NOT NULL AND response IS NOT NULL)
        OR (outcome = 'conflict' AND http_status = 409 AND committed_revision IS NULL AND response IS NOT NULL)
    )
);

-- A claim may be incomplete INSIDE a transaction, never at COMMIT.
-- Query the final row rather than NEW: the deferred INSERT event contains
-- the original placeholder even after the application finalizes it.
CREATE FUNCTION require_terminal_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt processed_mutations%ROWTYPE;
BEGIN
    SELECT * INTO receipt FROM processed_mutations WHERE mutation_id = NEW.mutation_id;
    IF NOT FOUND OR receipt.outcome IS NULL OR receipt.http_status IS NULL OR receipt.response IS NULL THEN
        RAISE EXCEPTION 'mutation receipt must be terminal at commit' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER terminal_receipt_at_commit
AFTER INSERT OR UPDATE ON processed_mutations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_terminal_receipt();

CREATE FUNCTION preserve_receipt_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.outcome IS NOT NULL THEN
        RAISE EXCEPTION 'terminal mutation receipts are immutable' USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW.mutation_id, NEW.protocol_version, NEW.client_id, NEW.record_id, NEW.operation,
           NEW.base_revision, NEW.canonical_request, NEW.fingerprint)
       IS DISTINCT FROM
       ROW(OLD.mutation_id, OLD.protocol_version, OLD.client_id, OLD.record_id, OLD.operation,
           OLD.base_revision, OLD.canonical_request, OLD.fingerprint) THEN
        RAISE EXCEPTION 'mutation identity and envelope are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER immutable_receipt
BEFORE UPDATE ON processed_mutations
FOR EACH ROW EXECUTE FUNCTION preserve_receipt_identity();
