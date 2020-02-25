const config = require('config');
const EventEmitter = require('events').EventEmitter;
const Logger = require('../logging/Logger');
const SipError = require('drachtio-srf').SipError;

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

		// const session = new Session({ req, res, rtpengine, organization, source });

		try
		{
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

			for (const destinations of destinationSet)
			{
				for (const destination of destinations)
				{
					logger.info('handleInvite() | trying destination [destination:"%o"]', destination);

					// Get rtpengine SDP
					const sdpB = await this._rtpengine.offer({
						...this._rtpDetails,
						sdp        : req.body,
						rtpoptions : destination.rtpoptions
					});

					({
						uas : this._uas,
						uac : this._uac,
						response,
						reason
					} = await this._srf.createB2BUA(req, res, req.uri, {
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
					})
						.catch((error) =>
						{
							if (error instanceof SipError && error.status !== 487)
							{
								logger.debug(
									'handleInvite() | failed connecting trying next destination [callId:"%s", error:"%s"]',
									callId,
									error
								);

								return {
									response : error.status,
									reason   : error.reason
								}; // This will make uas, uac === null
							}

							throw error;
						}));

					if (this._uas && this._uac) // We are connected
					{
						this._handleDialogs(destination);

						return;
					}

					/**
					 * We could check reason for not connecting here
					 * and break out of current destination set to try
					 * next destination set.
					 * 
					 * Example:
					 * if (reason === 503)
					 * {
					 *   logger.warn('handleInvite() | destination server error');
					 *   break;
					 * }
					 */
				}
			}

			return res.send(480, 'Unable to connect');
		}
		catch (error)
		{
			logger.error('handleInvite() | error on invite [error:"%s"]', error);
		}
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

			await this._uac.modify(sdpUAS);

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

			await this._uas.modify(sdpUAC);

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