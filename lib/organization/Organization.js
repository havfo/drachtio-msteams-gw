const EventEmitter = require('events').EventEmitter;
const Logger = require('../logging/Logger');
const Route = require('./Route');
const Destination = require('./Destination');
const {
	getOrganization,
	getDestinations,
	getOrganizationRoutes
} = require('../database/databaseHelper');
const { InvalidStateError } = require('../utils/errors');

const logger = new Logger('Organization');

class Organization extends EventEmitter
{
	/**
	 * Factory function that creates and returns Organization instance.
	 *
	 * @async
	 *
	 * @param {int} id - The organization id
	 * @param {Srf} srf - Instance of srf
	 * 
	 * @returns {Organization} instance
	 */
	static async create({ id, srf })
	{
		let domain;

		try
		{
			const domainResults = await getOrganization(id);

			domainResults.forEach((result) =>
			{
				domain = result.domain;
			});

			if (!domain)
				throw new InvalidStateError('no domain for organization');

			const organization = new Organization({ id, domain, srf });

			await organization._loadDestinations();
			await organization._loadRoutes();

			return organization;
		}
		catch (error)
		{
			logger.error('create() | error loading [error:"%s"]', error);
		}
	}

	constructor({ id, domain, srf })
	{
		logger.debug('constructor() | [id:"%s", domain:"%s"]', id, domain);

		super();

		this._id = id;

		this._topLevelDomain = domain;

		this._srf = srf;

		this._destinations = [];

		this._routes = [];

		this._closed = false;
	}

	close()
	{
		logger.debug('close()');

		this._closed = true;

		this._destinations.forEach((destination) =>
		{
			if (!destination.closed)
				destination.close();
		});

		this._destinations = [];

		this._routes = [];

		this.emit('close');
	}

	/**
	 * @returns {Array<Route>} - All routes for this organizations
	 * 							for this origin order by priority
	 */
	getToTypesForFromType(type)
	{
		return this._routes.filter((route) => route.from === type)
			.sort((a, b) => b.priority - a.priority);
	}

	/**
	 * @returns {Array<Destination>} - All destinations for this organizations
	 * 									for this type order by priority
	 */
	getDestinationsForType(type)
	{
		return this._destinations.filter((destination) => destination.type === type)
			.sort((a, b) => b.priority - a.priority);
	}

	/**
	 * Starts pinging all destinations.
	 *
	 * @async
	 */
	async startPinging()
	{
		logger.debug('startPinging()');

		this._destinations.forEach((destination) =>
		{
			if (!destination.closed)
				destination.startPinging();
		});
	}

	/**
	 * Stops pinging all destinations.
	 *
	 * @async
	 */
	async stopPinging()
	{
		logger.debug('stopPinging()');

		this._destinations.forEach((destination) =>
		{
			if (!destination.closed)
				destination.stopPinging();
		});
	}

	/**
	 * Clears and reloads organization from database, except domain.
	 *
	 * @async
	 */
	async reloadOrganization()
	{
		logger.info('reloadOrganization()');

		this._destinations.forEach((destination) =>
		{
			if (!destination.closed)
				destination.close();
		});

		this._destination = [];

		await this._loadDestinations();

		this._routes = [];

		await this._loadRoutes();
	}

	async _loadDestinations()
	{
		logger.debug('_loadDestinations()');
		try
		{
			const destinationsResults = await getDestinations(this._id);

			destinationsResults.forEach((result) =>
			{
				const destination = new Destination({
					srf           : this._srf,
					destination   : result.destination,
					type          : result.typeid,
					description   : result.description,
					priority      : result.priority,
					optionsPing   : result.optionsping,
					rtpoptions    : JSON.parse(result.rtpoptions),
					contactDomain : this._topLevelDomain
				});

				this._destinations.push(destination);
			});
		}
		catch (error)
		{
			logger.error('_loadDestinations() | error loading [error:"%s"]', error);
		}
	}

	async _loadRoutes()
	{
		try
		{
			const routeResults = await getOrganizationRoutes(this._id);

			routeResults.forEach((result) =>
			{
				const route = new Route({
					from     : result.inboundtypeid,
					to       : result.outboundtypeid,
					priority : result.priority
				});

				this._routes.push(route);
			});
		}
		catch (error)
		{
			logger.error('_loadDispatchers() | error loading [error:"%s"]', error);
		}
	}

	get closed()
	{
		return this._closed;
	}

	get id()
	{
		return this._id;
	}

	get topLevelDomain()
	{
		return this._topLevelDomain;
	}

	get destinations()
	{
		return this._destinations;
	}

	get routes()
	{
		return this._routes;
	}
}

module.exports = Organization;