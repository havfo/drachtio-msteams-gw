const EventEmitter = require('events').EventEmitter;
const Logger = require('../logging/Logger');
const RtpEngine = require('./RtpEngine');
const InvalidStateError = require('../utils/errors').InvalidStateError;
const { getRtpEngines } = require('../database/databaseHelper');

const logger = new Logger('RtpEngines');

class RtpEngines extends EventEmitter
{
	/**
	 * Factory function that creates and returns RtpEngines instance.
	 *
	 * @async
	 * 
	 * @returns {RtpEngines} instance
	 */
	static async create()
	{
		try
		{
			const rtpengines = new RtpEngines();

			await rtpengines._loadRtpEngines();

			return rtpengines;
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
	constructor()
	{
		logger.debug('constructor()');

		super();

		this._closed = false;

		this._rtpengines = [];
	}

	/**
	 * Closes all RtpEngines
	 * 
	 * This is invoked from server
	 */
	close()
	{
		logger.debug('close()');

		this._closed = true;

		this._rtpengines.forEach((rtpengine) =>
		{
			if (!rtpengine.closed)
				rtpengine.close();
		});

		this._rtpengines = [];

		this.emit('close');
	}

	/**
	 * @returns {RtpEngine} - Either, first available rtpengine, or first rtpengine
	 */
	getRtpEngine()
	{
		if (this._rtpengines.length === 0)
			throw new InvalidStateError('no rtpengines configured');

		const availableRtpEngine =
			this._rtpengines.find((rtpengine) => rtpengine.available);

		if (availableRtpEngine)
			return availableRtpEngine;

		return this._rtpengines.find((rtpengine) => rtpengine);
	}

	/**
	 * Clears and reloads rtpengines from database
	 *
	 * @async
	 */
	async reloadRtpEngines()
	{
		logger.info('reloadRtpEngines()');

		this._rtpengines = [];

		await this._loadRtpEngines();
	}

	/**
	 * Loads all rtpengines database.
	 *
	 * @async
	 */
	async _loadRtpEngines()
	{
		logger.debug('_loadRtpEngines()');

		try
		{
			const results = await getRtpEngines();

			results.forEach(async (result) =>
			{
				const rtpengine = new RtpEngine({
					host            : result.host,
					port            : result.port,
					timeout         : result.timeout,
					rejectOnFailure : result.rejectonfail
				});

				this._rtpengines.push(rtpengine);
			});
		}
		catch (error)
		{
			logger.error('_loadRtpEngines() | error loading [error:"%s"]', error);
		}
	}

	/**
	 * Whether rtpengine is closed.
	 *
	 * @return {Boolean}
	 */
	get closed()
	{
		return this._closed;
	}
}

module.exports = RtpEngines;