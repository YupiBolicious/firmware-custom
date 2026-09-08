-- Fix complexity_level_reference seed: 60 fan-out rows (CROSS JOIN, shifted
-- columns) replaced by 10 correctly mapped rows, guarded against recurrence.
DELETE FROM complexity_level_reference;

ALTER TABLE IF EXISTS complexity_level_reference
  ADD CONSTRAINT uq_complexity_level_reference_code UNIQUE (reference_code);

INSERT INTO complexity_level_reference (complexity_level_id, reference_code, title, description, example_text)
SELECT cl.id, ref.reference_code, ref.title, ref.description, ref.example_text
FROM complexity_levels cl
JOIN (VALUES
    ('L0', 'REF-L0-001', 'Non Firmware Related', 'Items that are not firmware related', 'Mechanical label change, packaging change'),
    ('L1', 'REF-L1-001', 'UI Text Changes', 'Changes to displayed text only', 'Update UI text, change label wording'),
    ('L2', 'REF-L2-001', 'Alarm Setpoint Adjustment', 'Adjust alarm setpoint configuration', 'Change alarm setpoint configuration'),
    ('L2', 'REF-L2-002', 'I/O Configuration Changes', 'I/O configuration changes without additional hardware board', 'Change I/O mapping without new board'),
    ('L3', 'REF-L3-001', 'Menu Tree Modification', 'Modify menu tree structure', 'Menu tree modification'),
    ('L3', 'REF-L3-002', 'Menu Tree Reorganization', 'Reorganize the menu tree', 'Menu tree reorganization'),
    ('L3', 'REF-L3-003', 'Additional Use Case (no new HW)', 'Additional use case without additional hardware board', 'Add a new use case on existing hardware'),
    ('L4', 'REF-L4-001', 'Additional Use Case (new HW)', 'Additional use case with additional hardware board', 'Add a use case requiring a new board'),
    ('L4', 'REF-L4-002', 'Closed-Loop Control Implementation', 'Implement closed-loop control', 'Closed-loop control implementation'),
    ('L5', 'REF-L5-001', 'New Firmware Architecture', 'New firmware architecture without existing base software', 'New firmware architecture from scratch')
) AS ref(level_key, reference_code, title, description, example_text)
  ON cl.code = ref.level_key
ON CONFLICT (reference_code) DO NOTHING;
