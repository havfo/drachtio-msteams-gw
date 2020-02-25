const config = require('config');
const EventEmitter = require('events').EventEmitter;
const Logger = require('../logging/Logger');

const { hostname, contactPort } = config.get('msgw');
const logger = new Logger('Destination');

class Destination extends EventEmitter
{
	constructor({
		srf,
		destination,
		type,
		description,
		priority,
		optionsPing,
		rtpoptions,
		contactDomain
	})
	{
		logger.debug('constructor()');

		super();

		this._srf = srf;

		this._destination = destination;

		this._type = type;

		this._description = description;

		this._priority = priority;

		this._optionsPing = optionsPing;

		this._rtpoptions = rtpoptions;

		this._contactDomain = contactDomain;

		// If we are to ping, it is not available.
		// If we don't ping, default always available to try
		this._available = optionsPing ? false : true;

		this._closed = false;

		if (this._optionsPing)
		{
			this._pingTimer = null;

			// Start periodic ping
			this._pingDestination = async () =>
			{
				logger.debug('_pingDestination() | [destination:"%s"]', this._destination);

				try
				{
					await new Promise((resolve, reject) =>
					{
						this._srf.request(
							this._destination,
							{
								method  : 'OPTIONS',
								headers :
								{
									Contact : `<sip:${hostname}.${this._contactDomain}:${contactPort};transport=tls>`
								}
							},
							(error, req) =>
							{
								if (error)
									return reject(error);
	
								req.on('response', (res) =>
								{
									if (res.status === 200)
										return resolve();
									else
										return reject(res.status);
								});
							}
						);
					});
	
					this._available = true;
				}
				catch (error)
				{
					this._available = false;
		
					logger.error('_pingDestination() | ping failed [destination:"%s", error:"%s"]', this._destination, error);
				}
		
				this._pingTimer = setTimeout(this._pingDestination, 30000);
			};
		}
	}

	close()
	{
		logger.debug('close()');

		this._closed = true;
		this._available = false;

		if (this._pingTimer)
			clearInterval(this._pingTimer);

		this._srf = null;

		this.emit('close');
	}

	/**
	 * Starts pinging destination.
	 *
	 * @async
	 */
	async startPinging()
	{
		logger.debug('startPinging()');

		if (this._optionsPing)
			this._pingDestination();
	}

	/**
	 * Stops pinging destination.
	 *
	 * @async
	 */
	async stopPinging()
	{
		logger.debug('stopPinging()');

		if (this._pingTimer)
			clearInterval(this._pingTimer);
	}

	get closed()
	{
		return this._closed;
	}

	get available()
	{
		return this._available;
	}

	get destination()
	{
		return this._destination;
	}

	get type()
	{
		return this._type;
	}

	get description()
	{
		return this._description;
	}

	get priority()
	{
		return this._priority;
	}

	get rtpoptions()
	{
		return this._rtpoptions;
	}
}

module.exports = Destination;