const config = require('config');
const util = require('util');
const mysql = require('mysql');
const Logger = require('../logging/Logger');

const databaseConfig = config.get('mysql');
const logger = new Logger('database');

const pool = mysql.createPool(databaseConfig);

// Ping database to check for common exception errors.
pool.getConnection((err, connection) =>
{
	if (err)
	{
		if (err.code === 'PROTOCOL_CONNECTION_LOST')
		{
			logger.error('Database connection was closed.');
		}
		if (err.code === 'ER_CON_COUNT_ERROR')
		{
			logger.error('Database has too many connections.');
		}
		if (err.code === 'ECONNREFUSED')
		{
			logger.error('Database connection was refused.');
		}
	}

	if (connection)
		connection.release();

	return;
});

// Promisify for Node.js async/await.
pool.query = util.promisify(pool.query);

module.exports = pool;