const pool = require('../config/db');

const USER_COLUMNS = `u.id, u.username, u.email, u.full_name, u.is_active, u.created_at`;

const findUserWithRolesById = async (userId) => {
  const result = await pool.query(
    `SELECT ${USER_COLUMNS},
            COALESCE(array_agg(r.code ORDER BY r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.id = $1
     GROUP BY u.id`,
    [userId]
  );
  return result.rows[0] || null;
};

const findAll = async () => {
  const result = await pool.query(
    `SELECT ${USER_COLUMNS},
            COALESCE(array_agg(r.code ORDER BY r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     GROUP BY u.id
     ORDER BY u.id`
  );
  return result.rows;
};

const findByEmailId = async (email) => {
  const result = await pool.query(
    `SELECT id FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
};

const findByUsernameId = async (username) => {
  const result = await pool.query(
    `SELECT id FROM users WHERE LOWER(username) = LOWER($1)`,
    [username]
  );
  return result.rows[0] || null;
};

const findRolesByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT r.code
     FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1
     ORDER BY r.code`,
    [userId]
  );
  return result.rows.map((row) => row.code);
};

const create = async ({ username, email, password_hash, full_name }) => {
  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash, full_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [username, email, password_hash, full_name]
  );
  return result.rows[0];
};

const update = async (id, { username, full_name, is_active }) => {
  const result = await pool.query(
    `UPDATE users
     SET username = COALESCE($2, username),
         full_name = COALESCE($3, full_name),
         is_active = COALESCE($4, is_active),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [id, username, full_name, is_active]
  );
  return result.rows[0] || null;
};

const attachRoles = async (client, userId, roleCodes) => {
  for (const code of roleCodes) {
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE code = $2`,
      [userId, code]
    );
  }
};

const replaceRoles = async (client, userId, roleCodes) => {
  await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
  await attachRoles(client, userId, roleCodes);
};

const createWithRoles = async ({ username, email, password_hash, full_name, roleCodes }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO users (username, email, password_hash, full_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [username, email, password_hash, full_name]
    );
    const userId = ins.rows[0].id;
    await attachRoles(client, userId, roleCodes);
    await client.query('COMMIT');
    return findUserWithRolesById(userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const updateWithRoles = async (id, { username, full_name, is_active, roleCodes }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE users
       SET username = COALESCE($2, username),
           full_name = COALESCE($3, full_name),
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [id, username, full_name, is_active]
    );
    if (!upd.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    if (roleCodes) {
      await replaceRoles(client, id, roleCodes);
    }
    await client.query('COMMIT');
    return findUserWithRolesById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const updatePasswordHash = async (userId, hash) => {
  const result = await pool.query(
    `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1 RETURNING id`,
    [userId, hash]
  );
  return result.rows[0] || null;
};

module.exports = {
  findUserWithRolesById,
  findAll,
  findByEmailId,
  findByUsernameId,
  findRolesByUserId,
  create,
  update,
  createWithRoles,
  updateWithRoles,
  updatePasswordHash,
};