import { neon } from '@neondatabase/serverless';

let _sql = null;

function getSql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set. Please add it to your .env file.');
    }
    _sql = neon(process.env.DATABASE_URL, {
      fetchConnectionCache: true,
    });
  }
  return _sql;
}

export function sql(strings, ...values) {
  return getSql()(strings, ...values);
}
