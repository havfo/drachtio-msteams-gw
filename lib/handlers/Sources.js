const Logger = require('../logging/Logger');
const Source = require('./Source');
const { getSources } = require('../database/databaseHelper');

const logger = new Logger('Sources');

class Sources
{
	/**
	 * Factory function that creates and returns Sources instance.
	 *
	 * @async
	 * 
	 * @returns {Sources} instance
	 */
	static async create()
	{
		try
		{
			const sources = new Sources();

			await sources._loadSources();

			return sources;
		}
		catch (error)
		{
			logger.error('create() | error loading [error:"%s"]', error);
		}
	}

	/**
	 * @private
	 */
	constructor()
	{
		logger.debug('constructor()');

		this._sources = [];
	}

	/**
	 * @returns {Source} - source matching address.
	 */
	getSource(address)
	{
		return this._sources.find((source) => source.address === address);
	}

	/**
	 * Clears and reloads sources from database.
	 *
	 * @async
	 */
	async reloadSources()
	{
		logger.info('reloadSources()');

		this._sources = [];

		await this._loadSources();
	}

	/**
	 * Loads all sources and types from database.
	 *
	 * @async
	 */
	async _loadSources()
	{
		logger.debug('_loadSources()');

		try
		{
			const results = await getSources();

			results.forEach(async (result) =>
			{
				const source = new Source({
					address    : result.address,
					type       : result.typeid,
					rtpoptions : JSON.parse(result.rtpoptions)
				});

				this._sources.push(source);
			});
		}
		catch (error)
		{
			logger.error('_loadSources() | error loading [error:"%s"]', error);
		}
	}
}

module.exports = Sources;