const EventEmitter = require('events').EventEmitter;
const Logger = require('../logging/Logger');
const Rtpengine = require('rtpengine-client').Client;

const logger = new Logger('RtpEngine');

class RtpEngine extends EventEmitter
{
	/**
	 * @private
	 *
	 * @emits close
	 * @emits available
	 * @emits unavailable
	 */
	constructor({ host, port, timeout, rejectOnFailure })
	{
		logger.debug('constructor()');

		super();

		this._rtpEngineConfig = {
			host,
			port,
			timeout,
			rejectOnFailure
		};

		this._closed = false;

		this._available = false;

		this._pingTimer = null;

		this._rtpengine = new Rtpengine(this._rtpEngineConfig);

		// Start periodic ping of rtpengine
		this._checkRtpEngine = async () =>
		{
			logger.debug('_checkRtpEngine() | ping');
			try
			{
				await this._rtpengine.ping(this._rtpEngineConfig);
	
				this.available = true;
	
				logger.debug('_checkRtpEngine() | pong');
			}
			catch (error)
			{
				this.available = false;
	
				logger.error('_checkRtpEngine() | error connecting to rtpengine [error:"%s"]', error);
			}
	
			this._pingTimer = setTimeout(this._checkRtpEngine, 10000);
		};

		this._checkRtpEngine();
	}

	/**
	 * Closes rtpengine
	 * 
	 * This is invoked from server
	 */
	close()
	{
		logger.debug('close()');

		this._closed = true;
		this.available = false;

		if (this._pingTimer)
			clearInterval(this._pingTimer);

		if (this._rtpengine)
			this._rtpengine = null;

		this.emit('close');
	}

	/**
	 * Takes SDP from call A-leg and
	 * returns the SDP that will be sent to call B-leg
	 *
	 * @async
	 *
	 * @param {String} sdp - A-leg SDP
	 * @param {String} callId - CallId
	 * @param {String} fromTag - Tag on From header
	 * @param {Object} rtpoptions - Options sent to RtpEngine,
	 * 								example { 'ICE': 'remove', 'record call': 'yes' }
	 *
	 * @returns {String} SDP
	 */
	async offer({ sdp, callId, fromTag, rtpoptions })
	{
		logger.debug('offer() [callId:"%s", rtpoptions:"%s"]', callId, rtpoptions);

		if (!this.available)
		{
			// Failed, return original SDP as last resort
			logger.error('offer() | rtpengine not connected');

			return sdp;
		}

		return await this._rtpengine.offer(
			this._rtpEngineConfig,
			Object.assign(
				{
					'sdp'      : sdp,
					'call-id'  : callId,
					'from-tag' : fromTag
				},
				rtpoptions
			))
			.then((response) =>
			{
				if (response && response.result === 'ok')
					return response.sdp;

				// Failed, return original SDP as last resort
				logger.error('offer() | rtpengine failed [response:"%o"]', response);

				return sdp;
			});
	}

	/**
	 * Takes SDP from call B-leg and
	 * returns the SDP that will be sent back to call A-leg
	 *
	 * @async
	 *
	 * @param {String} sdp - A-leg SDP
	 * @param {String} callId - CallId
	 * @param {String} fromTag - Tag on From header
	 * @param {String} toTag - Tag on To header
	 * @param {Object} rtpoptions - Options sent to RtpEngine,
	 * 								example { 'ICE': 'remove', 'record call': 'yes' }
	 * 
	 * @returns {String} SDP
	 */
	async answer({ sdp, callId, fromTag, toTag, rtpoptions })
	{
		logger.debug('answer() [callId:"%s", rtpoptions:"%s"]', callId, rtpoptions);

		if (!this.available)
		{
			// Failed, return original SDP as last resort
			logger.error('answer() | rtpengine not connected');

			return sdp;
		}

		return await this._rtpengine.answer(
			this._rtpEngineConfig,
			Object.assign(
				{
					'sdp'      : sdp,
					'call-id'  : callId,
					'from-tag' : fromTag,
					'to-tag'   : toTag
				},
				rtpoptions
			))
			.then((response) =>
			{
				if (response && response.result === 'ok')
					return response.sdp;

				// Failed, return original SDP as last resort
				logger.error('answer() | rtpengine failed [response:"%o"]', response);

				return sdp;
			});
	}

	/**
	 * Deletes the call and frees rtpengine resources
	 *
	 * @async
	 *
	 * @param {String} callId - CallId
	 * @param {String} fromTag - Tag on From header
	 */
	async delete({ callId, fromTag })
	{
		logger.debug('delete() [callId:"%s"]', callId);

		if (!this.available)
		{
			// Failed, return original SDP as last resort
			logger.error('delete() | rtpengine not connected');

			return;
		}

		return await this._rtpengine.delete(
			this._rtpEngineConfig,
			{
				'call-id'  : callId,
				'from-tag' : fromTag
			})
			.then((response) =>
			{
				if (response && response.result === 'ok')
					return;

				// Failed, return original SDP as last resort
				logger.error('delete() | rtpengine failed [response:"%o"]', response);

				return;
			});
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

	get available()
	{
		return this._available;
	}

	set available(available)
	{
		if (available !== this._available)
		{
			available ? this.emit('available') : this.emit('unavailable');

			this._available = available;
		}
	}
}

module.exports = RtpEngine;