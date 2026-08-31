-- Firmware Custom Item Classification & Estimation System
-- Phase 6 Milestone Schema + Seed Data
-- IDENTITY AND ACCESS

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
    example_text          TEXT,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    description     TEXT,
    customer        VARCHAR(200),
    status          VARCHAR(30) NOT NULL DEFAULT 'DRAFT',  -- DRAFT | ANALYZED | FINALIZED | PRODUCTION | COMPLETED
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
    work_order_group_id INT NOT NULL REFERENCES work_order_groups(id) ON DELETE CASCADE,
    item_number         VARCHAR(50) NOT NULL,
    title               VARCHAR(300) NOT NULL,
    description         TEXT,
    quantity            INT NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (work_order_group_id, item_number)
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
    UNIQUE (work_order_item_id)
);
-- KB/MASTER DATA TEMPORARY YEAH
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
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    status              VARCHAR(30) NOT NULL DEFAULT 'OPEN',
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
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_classifications_status ON classifications(status);
CREATE INDEX IF NOT EXISTS idx_classifications_reviewed_by_status ON classifications(reviewed_by, status);
CREATE INDEX IF NOT EXISTS idx_classifications_created_at ON classifications(created_at);
CREATE INDEX IF NOT EXISTS idx_classifications_reviewed_at ON classifications(reviewed_at) WHERE reviewed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_order_groups_work_order_id ON work_order_groups(work_order_id);
CREATE INDEX IF NOT EXISTS idx_work_order_items_work_order_id ON work_order_items(work_order_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_action_created ON audit_trail(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_estimations_work_order_item_id ON item_estimations(work_order_item_id);
CREATE INDEX IF NOT EXISTS idx_production_tasks_work_order_id ON production_tasks(work_order_id);
-- SEED DATA EAK
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

-- Complexity Level References
INSERT INTO complexity_level_reference (complexity_level_id, reference_code, title, description, example_text)
SELECT cl.id, ref.reference_code, ref.title, ref.description, ref.example_text
FROM complexity_levels cl
CROSS JOIN (VALUES
    ('L0', 'REF-L0-001', 'Non Firmware Related', 'Items that are not firmware related', 'Mechanical label change, packaging change'),
    ('L1', 'REF-L1-001', 'UI Text Changes', 'Changes to displayed text only', 'Update UI text, change label wording'),
    ('L2', 'REF-L2-001', 'Alarm Setpoint Adjustment', 'Adjust alarm setpoint configuration', 'Change alarm setpoint configuration'),
    ('L2', 'REF-L2-002', 'I/O Configuration Changes', 'I/O configuration changes without additional hardware board', 'Change I/O mapping without new board'),
    ('L3', 'REF-L3-001', 'Menu Tree Modification', 'Modify the menu tree structure', 'Menu tree modification'),
    ('L3', 'REF-L3-002', 'Menu Tree Reorganization', 'Reorganize the menu tree', 'Menu tree reorganization'),
    ('L3', 'REF-L3-003', 'Additional Use Case (no new HW)', 'Additional use case without additional hardware board', 'Add a new use case on existing hardware'),
    ('L4', 'REF-L4-001', 'Additional Use Case (new HW)', 'Additional use case with additional hardware board', 'Add a use case requiring a new board'),
    ('L4', 'REF-L4-002', 'Closed-Loop Control Implementation', 'Implement closed-loop control', 'Closed-loop control implementation'),
    ('L5', 'REF-L5-001', 'New Firmware Architecture', 'New firmware architecture without existing base software', 'New firmware architecture from scratch')
) AS ref(reference_code, title, description, example_text)
ON CONFLICT DO NOTHING;

-- Classification Rules (deterministic, priority-ordered)
INSERT INTO classification_rules (rule_code, keyword_pattern, fw_related, complexity_level_id, confidence_score, priority) VALUES
('RULE-NONFW-LABEL',   'mechanical label',        FALSE, NULL, 98.00, 10),
('RULE-NONFW-PACKAGING','packaging',              FALSE, NULL, 98.00, 10),
('RULE-L1-UI-TEXT',    'ui text',                 TRUE,  (SELECT id FROM complexity_levels WHERE code='L1'), 98.00, 20),
('RULE-L1-COSMETIC',   'cosmetic',                TRUE,  (SELECT id FROM complexity_levels WHERE code='L1'), 95.00, 20),
('RULE-L2-ALARM',      'alarm setpoint',          TRUE,  (SELECT id FROM complexity_levels WHERE code='L2'), 96.00, 30),
('RULE-L2-IO-CONFIG',  'io configuration',        TRUE,  (SELECT id FROM complexity_levels WHERE code='L2'), 95.00, 30),
('RULE-L3-MENU',       'menu tree',               TRUE,  (SELECT id FROM complexity_levels WHERE code='L3'), 94.00, 40),
('RULE-L3-USECASE',    'use case',                TRUE,  (SELECT id FROM complexity_levels WHERE code='L3'), 92.00, 40),
('RULE-L4-CLOSEDLOOP', 'closed-loop',             TRUE,  (SELECT id FROM complexity_levels WHERE code='L4'), 93.00, 50),
('RULE-L4-NEWHW',      'additional hardware board', TRUE, (SELECT id FROM complexity_levels WHERE code='L4'), 91.00, 50),
('RULE-L5-ARCH',       'new firmware architecture', TRUE, (SELECT id FROM complexity_levels WHERE code='L5'), 90.00, 60)
ON CONFLICT (rule_code) DO NOTHING;

-- Confidence Thresholds
INSERT INTO confidence_thresholds (threshold_code, high_confidence_min, low_confidence_max, description) VALUES
('DEFAULT', 90.00, 60.00, 'High confidence >= 90 auto-classifies; low/unknown < 60 goes to coder review')
ON CONFLICT (threshold_code) DO NOTHING;

-- Knowledge Base (seed items for exact matching)
INSERT INTO kb_items (kb_code, title, description, keywords, fw_related, complexity_level_id, confidence_score, source) VALUES
('KB-0001', 'Change alarm setpoint configuration', 'Adjust alarm setpoint configuration value', 'alarm,setpoint,configuration', TRUE,  (SELECT id FROM complexity_levels WHERE code='L2'), 96.00, 'SEED'),
('KB-0002', 'Update UI text', 'Update displayed UI text', 'ui,text,display', TRUE,  (SELECT id FROM complexity_levels WHERE code='L1'), 98.00, 'SEED'),
('KB-0003', 'Mechanical label change', 'Change mechanical label', 'mechanical,label', FALSE, NULL, 98.00, 'SEED'),
('KB-0004', 'Menu tree modification', 'Modify menu tree structure', 'menu,tree,modify', TRUE,  (SELECT id FROM complexity_levels WHERE code='L3'), 94.00, 'SEED'),
('KB-0005', 'Closed-loop control implementation', 'Implement closed-loop control', 'closed,loop,control', TRUE,  (SELECT id FROM complexity_levels WHERE code='L4'), 93.00, 'SEED')
ON CONFLICT (kb_code) DO NOTHING;

-- Machine models (seed)
INSERT INTO machine_model (model_code, name, description) VALUES
('FWX-100', 'FWX-100 Series', 'Base firmware platform for standard production units'),
('FWX-200', 'FWX-200 Series', 'Advanced platform with expanded I/O and connectivity'),
('FWX-300', 'FWX-300 Series', 'High-performance platform for industrial applications')
ON CONFLICT (model_code) DO NOTHING;

INSERT INTO machine_model_ver (machine_model_id, version_code, description)
SELECT id, 'v1.0', 'Initial release' FROM machine_model WHERE model_code = 'FWX-100'
UNION ALL
SELECT id, 'v2.0', 'Updated communication protocols' FROM machine_model WHERE model_code = 'FWX-100'
UNION ALL
SELECT id, 'v1.0', 'Initial release' FROM machine_model WHERE model_code = 'FWX-200'
UNION ALL
SELECT id, 'v1.1', 'Bugfix release' FROM machine_model WHERE model_code = 'FWX-200'
UNION ALL
SELECT id, 'v2.0', 'Major rewrite with new HAL' FROM machine_model WHERE model_code = 'FWX-200'
UNION ALL
SELECT id, 'v1.0', 'Initial release' FROM machine_model WHERE model_code = 'FWX-300'
ON CONFLICT DO NOTHING;

-- MOCK WORK ORDER WO-2026-001 (for validation)
INSERT INTO work_orders (wo_number, title, description, customer, status, created_by)
SELECT 'WO-2026-001', 'Firmware Custom Items - Q1 2026', 'Mock customer for prototype validation', 'Acme Corp', 'DRAFT', u.id
FROM users u WHERE u.username = 'pm@demo'
ON CONFLICT (wo_number) DO NOTHING;

INSERT INTO work_order_groups (work_order_id, machine_model_id, machine_model_version_id)
SELECT wo.id, mm.id, mmv.id
FROM work_orders wo
JOIN machine_model mm ON mm.model_code = 'FWX-100'
JOIN machine_model_ver mmv ON mmv.machine_model_id = mm.id AND mmv.version_code = 'v1.0'
WHERE wo.wo_number = 'WO-2026-001'
  AND NOT EXISTS (SELECT 1 FROM work_order_groups wog WHERE wog.work_order_id = wo.id);

INSERT INTO work_order_items (work_order_id, work_order_group_id, item_number, title, description, quantity)
SELECT wo.id, wog.id, it.item_number, it.title, it.description, it.quantity
FROM work_orders wo
JOIN work_order_groups wog ON wog.work_order_id = wo.id
JOIN (VALUES
    ('ITEM-001', 'Change alarm setpoint configuration', 'Adjust the alarm setpoint configuration for the machine', 1),
    ('ITEM-002', 'Update UI text', 'Update the displayed UI text on the operator panel', 1),
    ('ITEM-003', 'Add new adaptive control logic', 'Add new adaptive control logic to the firmware', 1),
    ('ITEM-004', 'Mechanical label change', 'Change the mechanical label on the enclosure', 1)
) AS it(item_number, title, description, quantity)
ON wo.wo_number = 'WO-2026-001'
ON CONFLICT (work_order_group_id, item_number) DO NOTHING;