const config = require('config');
const EventEmitter = require('events').EventEmitter;
const Logger = require('../logging/Logger');
const safeRun = require('../utils/safeRun');

const { hostname, contactPort } = config.get('msgw');

const logger = new Logger('Session');

class Session extends EventEmitter
{
	/**
	 * @private
	 *
	 * @emits close
	 */
	constructor({ rtpengine, organization, source, srf })
	{
		logger.debug('constructor()');

		super();

		this._rtpengine = rtpengine;

		this._organization = organization;

		this._source = source;

		this._srf = srf;

		this._closed = false;

		this._destroyed = false;

		this._uac = null;

		this._uas = null;

		this._rtpengineClosed = false;
	}

	/**
	 * Closes the Call.
	 * 
	 * This is called when the call is hung up, or invoked from server.
	 */
	close()
	{
		logger.debug('close()');

		this._closed = true;

		if (!this._destroyed)
		{
			this._uac.destroy();
			this._uas.destroy();

			this._destroyed = true;
		}

		this._rtpengine.delete({
			callId  : this._uas.sip.callId,
			fromTag : this._uas.sip.localTag
		})
			.then(() =>
			{
				this._rtpengine = null;
			});

		this._srf = null;

		this._uas = null;

		this._uac = null;

		this.emit('close');
	}

	async handleInvite(req, res)
	{
		const callId = req.get('Call-Id');
		const from = req.getParsedHeader('From');

		logger.info('handleInvite() [from:"%s", callId:"%s"]', from.uri, callId);

		const number = this._getNumber(req);
		// Find destination to send it to

		const destinationRoutes =
			this._organization.getToTypesForFromType(this._source.type);

		const destinationSet = [];

		destinationRoutes.forEach((route) =>
		{
			destinationSet.push(this._organization.getDestinationsForType(route.to));
		});

		this._rtpDetails = {
			callId,
			fromTag : from.params.tag
		};

		// eslint-disable-next-line no-unused-vars
		let response;
		// eslint-disable-next-line no-unused-vars
		let reason;

		let error;
		let dialogData;
		let inviteRequest;

		for (const destinations of destinationSet)
		{
			for (const destination of destinations)
			{
				logger.debug('handleInvite() | trying destination [destination:"%s"]', destination.destination);

				// Get rtpengine SDP
				const sdpB = await this._rtpengine.offer({
					...this._rtpDetails,
					sdp        : req.body,
					rtpoptions : destination.rtpoptions
				});

				([
					error,
					dialogData
				] = await safeRun(this._srf.createB2BUA(
					req,
					res,
					req.uri,
					// opts
					{
						proxy     : destination.destination,
						localSdpB : sdpB,
						localSdpA : this._getASDP.bind(
							this,
							this._source.rtpoptions,
							this._rtpDetails
						),
						headers : {
							'P-Route-Destination' : 'external',
							'P-Asserted-Identity' : `<sip:${number}@${this._organization.topLevelDomain}>`,
							Contact               : `<sip:${hostname}.${this._organization.topLevelDomain}:${contactPort};transport=tls>`
						},
						responseHeaders : {
							Contact : `<sip:${hostname}.${this._organization.topLevelDomain}:${contactPort};transport=tls>`
						},
						passFailure : false
					},
					{
						cbRequest : (err, request) =>
						{
							logger.debug('cbRequest() [method:"%s", source_port:"%s"]', request.method, request.source_port);

							/*
							inviteRequest = request;

							setTimeout(() =>
							{
								Promise.resolve().then(inviteRequest.cancel())
									.catch((_error) =>
									{
										logger.debug('cbRequest() | [_error:"%o"]', _error);
									});
							}, 2000);
							*/
						},
						cbFinalizedUac : (uac) =>
						{
							// logger.debug('cbFinalizedUac() | [uas:"%s"]', this._uas != null);
						}
					}
				)));

				// Failed to connect to this destination for some reason
				if (error)
				{
					if (error.status !== 487)
					{
						logger.debug(
							'handleInvite() | failed [callId:"%s", error:"%o"]',
							callId,
							error
						);

						if (error.status >= 500 && error.status < 600)
						{
							// Server error, continue with next destination in this set
							continue;
						}

						if (error.status >= 600)
						{
							// Global error, don't try any other destinations in this set
							// try next set (if any)
							break;
						}

						logger.debug(
							'handleInvite() | cancelled [callId:"%s", error:"%o"]',
							callId,
							error
						);

						// All other errors, return to A-leg
						return res.send(error.status, error.reason);
					}

					logger.debug(
						'handleInvite() | cancelled [callId:"%s"]',
						callId
					);

					// Cancelled
					return;
				}

				if (dialogData)
				{
					({
						uas : this._uas,
						uac : this._uac
					} = dialogData);

					if (this._uas && this._uac) // We are connected
					{
						return this._handleDialogs(destination);
					}
				}
			}
		}

		// Not able to connect to any desinations in any destination-set
		return res.send(error.status, error.reason);
	}

	async _getASDP(rtpoptions, rtpDetails, sdp, res)
	{
		logger.debug('_getASDP() [rtpoptions:"%o", rtpDetails:"%o"]', rtpoptions, rtpDetails);

		const to = res.getParsedHeader('To');

		return await this._rtpengine.answer({
			sdp,
			...rtpDetails,
			toTag : to.params.tag,
			rtpoptions
		});
	}

	_handleDialogs(destination)
	{
		logger.debug('_handleDialogs()');

		// when one side terminates, hang up the other
		this._uas.on('destroy', async () =>
		{
			logger.debug('_handleDialogs() | uas "destroy" event');

			this._uac.destroy();

			this._destroyed = true;

			await this._closeRtpengine();
		});

		this._uac.on('destroy', async () =>
		{
			logger.debug('_handleDialogs() | uac "destroy" event');

			this._uas.destroy();

			this._destroyed = true;

			await this._closeRtpengine();
		});

		this._uas.on('modify', async (req, res) =>
		{
			logger.debug('_handleDialogs() | uas "modify" event');

			const sdpUAS = await this._rtpengine.offer({
				...this._rtpDetails,
				sdp        : req.body,
				rtpoptions : destination.rtpoptions
			});

			const [ error ] = await safeRun(this._uac.modify(sdpUAS));

			if (error)
			{
				logger.error(
					'_handleDialogs() | uas "modify" event [error:"%o"]',
					error
				);

				return this.close();
			}

			const sdpUAC = await this._rtpengine.answer({
				...this._rtpDetails,
				toTag      : this._uac.sip.remoteTag,
				sdp        : this._uac.remote.sdp,
				rtpoptions : this._source.rtpoptions
			});

			res.send(200, {
				body : sdpUAC
			});
		});

		this._uac.on('modify', async (req, res) =>
		{
			logger.debug('_handleDialogs() | uac "modify" event');

			const sdpUAC = await this._rtpengine.answer({
				...this._rtpDetails,
				toTag      : this._uac.sip.remoteTag,
				sdp        : req.body,
				rtpoptions : this._source.rtpoptions
			});

			const [ error ] = await safeRun(this._uas.modify(sdpUAC));

			if (error)
			{
				logger.error(
					'_handleDialogs() | uac "modify" event [error:"%o"]',
					error
				);

				return this.close();
			}

			const sdpUAS = await this._rtpengine.offer({
				...this._rtpDetails,
				sdp        : this._uas.remote.sdp,
				rtpoptions : destination.rtpoptions
			});

			res.send(200, {
				body : sdpUAS
			});
		});
	}

	async _closeRtpengine()
	{
		logger.debug('_closeRtpengine()');

		if (!this._rtpengineClosed && this._rtpDetails)
		{
			await this._rtpengine.delete({ ...this._rtpDetails });

			this._rtpengineClosed = true;
		}
	}

	_getNumber(req)
	{
		const numberPattern = /\+?[1-9]\d{1,14}/i;
		const pai = req.get('P-Asserted-Identity');
		const to = req.get('To');

		let number;

		if (pai) // Try P-Asserted-Identity first
		{
			number = pai.match(numberPattern);

			if (number)
				return number[0];
		}

		number = req.uri.match(numberPattern); // Try request uri second
		if (number)
			return number[0];

		number = to.match(numberPattern); // Try to uri last
		if (number)
			return number[0];
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
}

module.exports = Session;