/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  const tables = ['users', 'companies', 'categories', 'jobs', 'applications', 'bookmarks'];
  tables.forEach(table => {
    pgm.addColumns(table, {
      created_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
      updated_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
    });
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  const tables = ['users', 'companies', 'categories', 'jobs', 'applications', 'bookmarks'];
  tables.forEach(table => {
    pgm.dropColumns(table, ['created_at', 'updated_at']);
  });
};
