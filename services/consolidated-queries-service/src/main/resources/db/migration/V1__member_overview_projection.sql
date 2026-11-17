-- Proyección MemberOverview en queries_db, construida a partir de eventos Kafka.
-- Los identificadores son referencias de integración: no hay claves foráneas hacia otras bases.

CREATE TABLE members (
    member_id  BIGINT      PRIMARY KEY,
    document   TEXT        NOT NULL,
    name       TEXT        NOT NULL,
    phone      TEXT        NOT NULL,
    email      TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

-- plan_id y created_at llegan con MEMBERSHIP_CREATED. Son nulos si ACTIVATED o EXPIRED se
-- procesan antes; en ese caso la membresía no se expone hasta que llegue MEMBERSHIP_CREATED.
CREATE TABLE memberships (
    membership_id BIGINT      PRIMARY KEY,
    member_id     BIGINT      NOT NULL,
    plan_id       BIGINT,
    status        VARCHAR(16) NOT NULL CHECK (status IN ('PENDING', 'ACTIVE', 'EXPIRED')),
    start_date    DATE,
    end_date      DATE,
    created_at    TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_memberships_member_recent
    ON memberships (member_id, created_at DESC, membership_id DESC);

CREATE TABLE access_attempts (
    attempt_id  BIGINT      PRIMARY KEY,
    member_id   BIGINT      NOT NULL,
    result      VARCHAR(16) NOT NULL CHECK (result IN ('ACCESS_GRANTED', 'ACCESS_DENIED')),
    reason      TEXT        NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_access_attempts_member_recent
    ON access_attempts (member_id, occurred_at DESC, attempt_id DESC);

-- Inbox transaccional (ProcessedEvent): UNIQUE(consumerName, eventId).
CREATE TABLE processed_events (
    consumer_name VARCHAR(100) NOT NULL,
    event_id      UUID         NOT NULL,
    processed_at  TIMESTAMPTZ  NOT NULL,
    CONSTRAINT pk_processed_events PRIMARY KEY (consumer_name, event_id)
);
