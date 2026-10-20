CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(50)  NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(100) NOT NULL UNIQUE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(200) NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

--MASTER DATA
CREATE TABLE IF NOT EXISTS complexity_levels (
    id                    SERIAL PRIMARY KEY,
    code                  VARCHAR(10)  NOT NULL UNIQUE,
    name                  VARCHAR(200) NOT NULL,
    description           TEXT,
    requirement_review_h  NUMERIC(10,2) NOT NULL DEFAULT 0,
    code_development_h    NUMERIC(10,2) NOT NULL DEFAULT 0,
    peer_review_fixing_h  NUMERIC(10,2) NOT NULL DEFAULT 0,
    bench_testing_h       NUMERIC(10,2) NOT NULL DEFAULT 0,
    unit_testing_h        NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_hours           NUMERIC(10,2) GENERATED ALWAYS AS (
        requirement_review_h + code_development_h + peer_review_fixing_h + bench_testing_h + unit_testing_h
    ) STORED,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS complexity_level_reference (
    id                    SERIAL PRIMARY KEY,
    complexity_level_id   INT NOT NULL REFERENCES complexity_levels(id) ON DELETE CASCADE,
    reference_code        VARCHAR(50) NOT NULL,
    title                 VARCHAR(300) NOT NULL,
    description           TEXT,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_complexity_level_reference_code UNIQUE (reference_code)
);

CREATE TABLE IF NOT EXISTS fw_modules (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(50) NOT NULL UNIQUE,
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classification_rules (
    id                    SERIAL PRIMARY KEY,
    rule_code             VARCHAR(50) NOT NULL UNIQUE,
    keyword_pattern       TEXT NOT NULL,
    fw_related            BOOLEAN NOT NULL,
    complexity_level_id   INT REFERENCES complexity_levels(id),
    confidence_score      NUMERIC(5,2) NOT NULL DEFAULT 90.00,
    priority              INT NOT NULL DEFAULT 100,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS confidence_thresholds (
    id                    SERIAL PRIMARY KEY,
    threshold_code        VARCHAR(50) NOT NULL UNIQUE,
    high_confidence_min   NUMERIC(5,2) NOT NULL DEFAULT 90.00,
    low_confidence_max    NUMERIC(5,2) NOT NULL DEFAULT 60.00,
    description           TEXT,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS machine_model (
    id          SERIAL PRIMARY KEY,
    model_code  VARCHAR(50) NOT NULL UNIQUE,
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS machine_model_ver (
    id                SERIAL PRIMARY KEY,
    machine_model_id  INT NOT NULL REFERENCES machine_model(id) ON DELETE CASCADE,
    version_code      VARCHAR(50) NOT NULL,
    description       TEXT,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (machine_model_id, version_code)
);
-- WORK ORDERS AND ITEMS
CREATE TABLE IF NOT EXISTS work_orders (
    id              SERIAL PRIMARY KEY,
    wo_number       VARCHAR(50) NOT NULL UNIQUE,
    title           VARCHAR(300),
    customer        VARCHAR(200),
    revision        INT NOT NULL DEFAULT 0 CHECK (revision >= 0),
    status          VARCHAR(30) NOT NULL DEFAULT 'DRAFT',  -- DRAFT | ANALYZED | FINALIZED | PRODUCTION | COMPLETED
    notes           TEXT,
    created_by      INT REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- MODEL/VERSION/SN GROUP PER WORK ORDER (WO -> groups -> items -> classification/complexity -> estimation)
CREATE TABLE IF NOT EXISTS work_order_groups (
    id                         SERIAL PRIMARY KEY,
    work_order_id              INT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    machine_model_id           INT REFERENCES machine_model(id),
    machine_model_version_id   INT REFERENCES machine_model_ver(id),
    serial_number              VARCHAR(100),
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (work_order_id, machine_model_id, machine_model_version_id, serial_number)
);

CREATE TABLE IF NOT EXISTS work_order_items (
    id                  SERIAL PRIMARY KEY,
    work_order_id       INT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    work_order_group_id INT REFERENCES work_order_groups(id) ON DELETE SET NULL,  -- legacy per-group scope; new items are WO-level (NULL)
    item_number         VARCHAR(50) NOT NULL,
    title               VARCHAR(300) NOT NULL,
    description         TEXT,
    quantity            INT NOT NULL DEFAULT 1,  -- business info only; never factors into man-hours
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    documentation_readiness VARCHAR(10)
);
-- CLASSFDICATIONS TO CHECK LEVEL
CREATE TABLE IF NOT EXISTS classifications (
    id                    SERIAL PRIMARY KEY,
    work_order_item_id    INT NOT NULL REFERENCES work_order_items(id) ON DELETE CASCADE,
    fw_related            BOOLEAN,
    complexity_level_id   INT REFERENCES complexity_levels(id),
    classification_method VARCHAR(30) NOT NULL DEFAULT 'MANUAL',  -- EXACT_MATCH | RULE | SIMILARITY | MANUAL
    confidence_score      NUMERIC(5,2),
    classification_reason TEXT,
    status                VARCHAR(30) NOT NULL DEFAULT 'PENDING',  -- PENDING | CLASSIFIED | CODER_REVIEW | NON_FIRMWARE
    reviewed_by           INT REFERENCES users(id),
    reviewed_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    input_hash            VARCHAR(64),
    kb_version            INT,
    assist_kb_id          INT,
    assist_kb_code        VARCHAR(50),
    assist_match_score    NUMERIC(5,2),
    assist_semantic_margin NUMERIC(6,3),
    assist_complexity_level_id INT REFERENCES complexity_levels(id) ON DELETE SET NULL,
    assist_fw_related     BOOLEAN,
    assist_response       VARCHAR(10) CHECK (assist_response IN ('ACCEPTED','IGNORED') OR assist_response IS NULL),
    review_reason         VARCHAR(50),
    assist_blocked_reason VARCHAR(100),
    UNIQUE (work_order_item_id)
);
-- ESTIMATION FOR ANLYZING
CREATE TABLE IF NOT EXISTS item_estimations (
    id                    SERIAL PRIMARY KEY,
    work_order_item_id    INT NOT NULL REFERENCES work_order_items(id) ON DELETE CASCADE,
    complexity_level_id   INT NOT NULL REFERENCES complexity_levels(id),
    requirement_review_h  NUMERIC(10,2) NOT NULL,
    code_development_h    NUMERIC(10,2) NOT NULL,
    peer_review_fixing_h  NUMERIC(10,2) NOT NULL,
    bench_testing_h       NUMERIC(10,2) NOT NULL,
    unit_testing_h        NUMERIC(10,2) NOT NULL,
    total_hours           NUMERIC(10,2) NOT NULL,
    is_current            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verification_mh       NUMERIC(10,2) NOT NULL DEFAULT 0,
    UNIQUE (work_order_item_id)
);

-- Verification tiers (doc/verification hours fixed per spec; see estimationRepository)
CREATE TABLE IF NOT EXISTS verification_levels (
    id                SERIAL PRIMARY KEY,
    code              VARCHAR(10) NOT NULL UNIQUE,
    name              VARCHAR(100) NOT NULL,
    verification_mh   NUMERIC(10,2) NOT NULL,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Complexity -> verification tier (V1: L1-L2, V2: L3-L4, V3: L5; L0 has no tier)
CREATE TABLE IF NOT EXISTS complexity_verification_map (
    complexity_level_id   INT NOT NULL REFERENCES complexity_levels(id),
    verification_level_id INT NOT NULL REFERENCES verification_levels(id),
    UNIQUE (complexity_level_id)
);

CREATE TABLE IF NOT EXISTS kb_items (
    id                    SERIAL PRIMARY KEY,
    kb_code               VARCHAR(50) NOT NULL UNIQUE,
    title                 VARCHAR(300) NOT NULL,
    description           TEXT,
    keywords              TEXT,
    fw_related            BOOLEAN NOT NULL,
    complexity_level_id   INT REFERENCES complexity_levels(id),
    confidence_score      NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    source                VARCHAR(30) NOT NULL DEFAULT 'SEED',
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    machine_model_id      INT REFERENCES machine_model(id),
    machine_model_version_id INT REFERENCES machine_model_ver(id)
);

-- assist_kb_id FK (kb_items created after classifications)
ALTER TABLE classifications
  ADD CONSTRAINT classifications_assist_kb_id_fkey FOREIGN KEY (assist_kb_id) REFERENCES kb_items(id) ON DELETE SET NULL;

-- KB corpus version (single row id=1): reuse gate for incremental analyze + cache key
CREATE TABLE IF NOT EXISTS kb_corpus_version (
    id          INT PRIMARY KEY DEFAULT 1,
    version     INT NOT NULL DEFAULT 1,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT kb_corpus_version_single CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS classification_matches (
    id                    SERIAL PRIMARY KEY,
    classification_id     INT NOT NULL REFERENCES classifications(id) ON DELETE CASCADE,
    kb_item_id            INT REFERENCES kb_items(id),
    rule_id               INT REFERENCES classification_rules(id),
    match_type            VARCHAR(30) NOT NULL,  -- EXACT | RULE | SIMILARITY
    match_score           NUMERIC(5,2),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_tasks (
    id                  SERIAL PRIMARY KEY,
    task_code           VARCHAR(150) NOT NULL UNIQUE,
    work_order_id       INT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    work_order_item_id  INT NOT NULL UNIQUE REFERENCES work_order_items(id) ON DELETE CASCADE,
    title               VARCHAR(300) NOT NULL,
    description         TEXT,
    completed           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_order_documents (
    id              SERIAL PRIMARY KEY,
    work_order_id   INT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    filename        VARCHAR(255) NOT NULL,
    original_name   VARCHAR(255) NOT NULL,
    mime_type       VARCHAR(100),
    size_bytes      INT,
    description     TEXT,
    uploaded_by     INT REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FOR RECORD AND TRAVEABILITY EAH
CREATE TABLE IF NOT EXISTS audit_trail (
    id            SERIAL PRIMARY KEY,
    user_id       INT REFERENCES users(id),
    action        VARCHAR(100) NOT NULL,
    entity_type   VARCHAR(50) NOT NULL,
    entity_id     INT,
    details       JSONB,
    ip_address    VARCHAR(50),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    work_order_id INT REFERENCES work_orders(id) ON DELETE SET NULL
);
-- WORK ORDER ACCESS GRANTS (unique pair guards grantWorkOrderAccess ON CONFLICT)
CREATE TABLE IF NOT EXISTS work_order_access (
    work_order_id   INT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by      INT REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (work_order_id, user_id)
);

-- IN-APP NOTIFICATIONS (event-driven, see reports/notification-flow.md)
CREATE TABLE IF NOT EXISTS notifications (
    id          BIGSERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status      VARCHAR(50),
    message     TEXT,
    entity_id   INT,
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_work_order_access_work_order_id ON work_order_access(work_order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_classifications_status ON classifications(status);
CREATE INDEX IF NOT EXISTS idx_classifications_reviewed_by_status ON classifications(reviewed_by, status);
CREATE INDEX IF NOT EXISTS idx_classifications_created_at ON classifications(created_at);
CREATE INDEX IF NOT EXISTS idx_classifications_reviewed_at ON classifications(reviewed_at) WHERE reviewed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_classifications_assist ON classifications(assist_kb_id) WHERE assist_kb_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_created_at ON work_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_work_order_groups_work_order_id ON work_order_groups(work_order_id);
CREATE INDEX IF NOT EXISTS idx_work_order_items_work_order_id ON work_order_items(work_order_id);
CREATE INDEX IF NOT EXISTS idx_kb_items_model ON kb_items (machine_model_id, machine_model_version_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_kb_items_created_at ON kb_items(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_trail_action_created ON audit_trail(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_work_order_id ON audit_trail (work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at ON audit_trail (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at_desc ON audit_trail (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_estimations_work_order_item_id ON item_estimations(work_order_item_id);
CREATE INDEX IF NOT EXISTS idx_production_tasks_work_order_id ON production_tasks(work_order_id);
CREATE INDEX IF NOT EXISTS idx_production_tasks_completed ON production_tasks(work_order_id, completed);
CREATE UNIQUE INDEX IF NOT EXISTS uq_classification_matches_entity ON classification_matches (classification_id, COALESCE(kb_item_id, 0), COALESCE(rule_id, 0));
-- SEED DATA (roles, demo users, complexity levels, verification tiers)
-- Roles
INSERT INTO roles (code, name, description) VALUES
('PM',    'Project Manager', 'Creates and manages Work Orders, requests estimation, reviews previews'),
('CODER', 'Coder',           'Reviews uncertain/unknown custom items, confirms classification and complexity'),
('ADMIN', 'Administrator',   'Manages users, roles, complexity levels, rules, and system configuration')
ON CONFLICT (code) DO NOTHING;

-- Users (password for all demo users: "password123" — hashed with bcrypt)
INSERT INTO users (username, email, password_hash, full_name) VALUES
('pm@demo',    'pm@demo.com',    '$2a$10$u7sVGdz4bv.ZUf3Z0vwQ4ufyTc37g.RzaTPs4fnzhq6MTkZNaOo.C', 'Demo PM'),
('coder@demo', 'coder@demo.com', '$2a$10$u7sVGdz4bv.ZUf3Z0vwQ4ufyTc37g.RzaTPs4fnzhq6MTkZNaOo.C', 'Demo Coder'),
('admin@demo', 'admin@demo.com', '$2a$10$u7sVGdz4bv.ZUf3Z0vwQ4ufyTc37g.RzaTPs4fnzhq6MTkZNaOo.C', 'Demo Admin')
ON CONFLICT (username) DO NOTHING;

-- User roles
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE (u.username = 'pm@demo'    AND r.code = 'PM')
   OR (u.username = 'coder@demo' AND r.code = 'CODER')
   OR (u.username = 'admin@demo' AND r.code = 'ADMIN')
ON CONFLICT DO NOTHING;

-- Complexity Levels (single source of truth for fixed hours)
INSERT INTO complexity_levels (code, name, description, requirement_review_h, code_development_h, peer_review_fixing_h, bench_testing_h, unit_testing_h) VALUES
('L0', 'Non Firmware Related',            'Not firmware related; no development effort', 0,  0,  0,  0,  0),
('L1', 'Cosmetic Change',                 'UI text changes, cosmetic updates',           1,  2,  1,  1,  1),
('L2', 'Parametric Change',               'Alarm setpoint, I/O config changes',          2,  4,  2,  2,  2),
('L3', 'Functional Change - Low Complexity', 'Menu tree changes, additional use case without new hardware', 4, 16, 4, 4, 8),
('L4', 'Functional Change - High Complexity', 'Additional use case with new hardware, closed-loop control', 6, 32, 8, 12, 16),
('L5', 'System-Level Development',        'New firmware architecture without existing base', 8, 72, 16, 16, 24)
ON CONFLICT (code) DO NOTHING;

-- KB corpus version
INSERT INTO kb_corpus_version (id, version) VALUES (1, 1) ON CONFLICT (id) DO NOTHING;

-- Verification tiers (fixed per spec: 8/24/40 MH)
INSERT INTO verification_levels (code, name, verification_mh) VALUES
('V1', 'Verification Level 1', 8.00),
('V2', 'Verification Level 2', 24.00),
('V3', 'Verification Level 3', 40.00)
ON CONFLICT (code) DO NOTHING;

-- Complexity -> tier: V1 L1-L2, V2 L3-L4, V3 L5 (L0 has no tier)
INSERT INTO complexity_verification_map (complexity_level_id, verification_level_id)
SELECT cl.id, v.id FROM complexity_levels cl
JOIN verification_levels v ON v.code = CASE
  WHEN cl.code IN ('L1', 'L2') THEN 'V1'
  WHEN cl.code IN ('L3', 'L4') THEN 'V2'
  WHEN cl.code =  'L5' THEN 'V3'
END
WHERE cl.code IN ('L1', 'L2', 'L3', 'L4', 'L5')
ON CONFLICT (complexity_level_id) DO NOTHING;
