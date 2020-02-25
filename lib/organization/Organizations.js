const EventEmitter = require('events').EventEmitter;
const Logger = require('../logging/Logger');
const Organization = require('./Organization');
const { getOrganizations } = require('../database/databaseHelper');

const logger = new Logger('Organizations');

class Organizations extends EventEmitter
{
	/**
	 * Factory function that creates and returns Organizations instance.
	 *
	 * @async
	 *
	 * @param {Srf} srf - Instance of srf
	 * 
	 * @returns {Organizations} instance
	 */
	static async create({ srf })
	{
		try
		{
			const organizations = new Organizations({ srf });

			await organizations._loadOrganizations();

			return organizations;
		}
		catch (error)
		{
			logger.error('create() | error loading [error:"%s"]', error);
		}
	}

	/**
	 * @private
	 *
	 * @emits close
	 */
	constructor({ srf })
	{
		logger.debug('constructor()');

		super();

		this._srf = srf;

		this._closed = false;

		this._organizations = new Map();

		this._pinging = false;
	}

	/**
	 * Closes the handler.
	 * 
	 * This is invoked from server.
	 */
	close()
	{
		logger.debug('close()');

		this._closed = true;

		this.emit('close');
	}

	/**
	 * @returns {Organization} - organization with specified domain.
	 */
	getOrganization(domain)
	{
		return Array.from(this._organizations.values())
			.find((organization) => organization.topLevelDomain === domain);
	}

	/**
	 * Starts pinging all destinations.
	 *
	 * @async
	 */
	async startPinging()
	{
		logger.debug('startPinging()');

		this._organizations.forEach((organization) =>
		{
			if (!organization.closed)
				organization.startPinging();
		});

		this._pinging = true;
	}

	/**
	 * Stops pinging all destinations.
	 *
	 * @async
	 */
	async stopPinging()
	{
		logger.debug('stopPinging()');

		this._organizations.forEach((organization) =>
		{
			if (!organization.closed)
				organization.stopPinging();
		});

		this._pinging = false;
	}

	/**
	 * Clears and reloads all organization from database.
	 *
	 * @async
	 */
	async reloadOrganizations()
	{
		logger.info('reloadOrganizations()');

		this._organizations.forEach((organization) =>
		{
			if (!organization.closed)
				organization.close();
		});

		this._organizations.clear();

		await this._loadOrganizations();
	}

	/**
	 * Clears and reloads organization from database.
	 *
	 * @async
	 */
	async reloadOrganization(id)
	{
		logger.info('reloadOrganizations() [id:"%s"]', id);

		const organization = this._organizations.get(id);

		if (organization)
		{
			await organization.reloadOrganization();
		}
	}

	async _loadOrganizations()
	{
		logger.debug('_loadOrganizations()');

		try
		{
			const results = await getOrganizations();

			for (const result of results)
			{
				const organization = await Organization.create({
					id  : result.id,
					srf : this._srf
				});

				this._organizations.set(result.id, organization);
			}
		}
		catch (error)
		{
			logger.error('_loadOrganizations() | error loading [error:"%s"]', error);
		}
	}

	/**
	 * Whether Call is closed.
	 *
	 * @return {Boolean}
	 */
	get closed()
	{
		return this._closed;
	}

	get pinging()
	{
		return this._pinging;
	}
}

module.exports = Organizations;