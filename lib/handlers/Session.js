const config = require('config');
const EventEmitter = require('events').EventEmitter;
const Logger = require('../logging/Logger');
const safeRun = require('../utils/safeRun');
const sdpTransform = require('sdp-transform');
const { transfer } = require('drachtio-fn-b2b-sugar');

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

		if (this._uac)
			safeRun(this._uac.destroy());

		if (this._uas)
			safeRun(this._uas.destroy());

		this._closeRtpengine().then(() =>
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
						proxyRequestHeaders : [
							'Min-SE',
							'Session-Expires',
							'Supported',
							'Allow',
							'Require'
						],
						proxyResponseHeaders : [
							'Min-SE',
							'Session-Expires',
							'Supported',
							'Allow',
							'Require'
						],
						passFailure : false
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
						res.send(error.status, error.reason);

						this.close();

						return;
					}

					logger.debug(
						'handleInvite() | cancelled [callId:"%s"]',
						callId
					);

					// Cancelled
					this.close();

					return;
				}

				if (dialogData)
				{
					return this._handleDialogs(dialogData, destination);
				}
			}
		}

		// Not able to connect to any desinations in any destination-set
		// All other errors, return to A-leg
		res.send(error.status, error.reason);

		this.close();

		return;
	}

	async _getASDP(rtpoptions, rtpDetails, sdp, res)
	{
		logger.debug('_getASDP() [rtpoptions:"%o", rtpDetails:"%o"]', rtpoptions, rtpDetails);

		const to = res.getParsedHeader('To');

		const sdpA = await this._rtpengine.answer({
			sdp,
			...rtpDetails,
			toTag : to.params.tag,
			rtpoptions
		});

		return sdpA;
	}

	_handleDialogs({ uas, uac }, destination)
	{
		logger.debug('_handleDialogs()');

		this._uas = uas;
		this._uac = uac;

		// when one side terminates, hang up the other
		uas.on('destroy', async () =>
		{
			logger.debug('_handleDialogs() | uas "destroy" event');

			this.close();
		});

		uac.on('destroy', async () =>
		{
			logger.debug('_handleDialogs() | uac "destroy" event');

			this.close();
		});

		uas.on('modify', async (req, res) =>
		{
			logger.debug('_handleDialogs() | uas "modify" event');

			const sdpUAS = await this._rtpengine.offer({
				...this._rtpDetails,
				sdp        : req.body,
				rtpoptions : destination.rtpoptions
			});

			const [ error ] = await safeRun(uac.modify(sdpUAS));

			if (error)
			{
				logger.error(
					'_handleDialogs() | uas "modify" event [error:"%o"]',
					error
				);

				return this.close();
			}

			let sdpUAC = await this._rtpengine.answer({
				...this._rtpDetails,
				toTag      : uac.sip.remoteTag,
				sdp        : uac.remote.sdp,
				rtpoptions : this._source.rtpoptions
			});

			let sdpObj = sdpTransform.parse(req.body);
			const direction = sdpObj.media[0].direction;

			sdpObj = sdpTransform.parse(sdpUAC);

			if (direction === 'inactive') // Make sure that both are inactive in case one is
			{
				sdpObj.media[0].direction = 'inactive';
			}

			sdpUAC = sdpTransform.write(sdpObj);

			res.send(200, {
				body : sdpUAC
			});
		});

		uac.on('modify', async (req, res) =>
		{
			logger.debug('_handleDialogs() | uac "modify" event');

			const sdpUAC = await this._rtpengine.answer({
				...this._rtpDetails,
				toTag      : uac.sip.remoteTag,
				sdp        : req.body,
				rtpoptions : this._source.rtpoptions
			});

			const [ error ] = await safeRun(uas.modify(sdpUAC));

			if (error)
			{
				logger.error(
					'_handleDialogs() | uac "modify" event [error:"%o"]',
					error
				);

				return this.close();
			}

			let sdpUAS = await this._rtpengine.offer({
				...this._rtpDetails,
				sdp        : uas.remote.sdp,
				rtpoptions : destination.rtpoptions
			});

			let sdpObj = sdpTransform.parse(req.body);
			const direction = sdpObj.media[0].direction;

			sdpObj = sdpTransform.parse(sdpUAS);

			if (direction === 'inactive') // Make sure that both are inactive in case one is
			{
				sdpObj.media[0].direction = 'inactive';
			}

			sdpUAS = sdpTransform.write(sdpObj);

			res.send(200, {
				body : sdpUAS
			});
		});

		uac.on('refer', async (req, res) =>
		{
			logger.debug('_handleDialogs() | uac "refer" event');

			const opts = {
				srf        : this._srf,
				req,
				res,
				transferor : uac
			};

			({
				transfereeDialog     : uac,
				transferTargetDialog : uas
			} = await transfer(opts));
		});

		uas.on('refer', async (req, res) =>
		{
			logger.debug('_handleDialogs() | uas "refer" event');

			const opts = {
				srf        : this._srf,
				req,
				res,
				transferor : uas
			};

			({
				transfereeDialog     : uas,
				transferTargetDialog : uac
			} = await transfer(opts));
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