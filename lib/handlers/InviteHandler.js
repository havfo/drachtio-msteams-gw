const EventEmitter = require('events').EventEmitter;
const Logger = require('../logging/Logger');
const Session = require('./Session');
const parseUri = require('drachtio-srf').parseUri;
const safeRun = require('../utils/safeRun');

const logger = new Logger('InviteHandler');

class InviteHandler extends EventEmitter
{
	/**
	 * @private
	 *
	 * @emits close
	 */
	constructor({ srf, rtpengines, organizations, sources })
	{
		super();

		this._srf = srf;

		this._rtpengines = rtpengines;

		this._organizations = organizations;

		this._sources = sources;

		this._closed = false;

		// callId -> Session
		this._sessions = new Map();
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

		this._sessions.forEach((session) =>
		{
			if (!session.closed)
				session.close();
		});

		this._sessions.clear();

		this._srf = null;

		this._rtpengines = null;

		this._organizations = null;

		this.emit('close');
	}

	getSession(callId)
	{
		return this._sessions.get(callId);
	}

	async handleInvite(req, res)
	{
		const callId = req.get('Call-Id');

		logger.info('handleInvite() [callId:"%s"]', callId);

		// Find where it came from
		const source = this._sources.getSource(req.source_address);

		if (!source)
			return res.send(484, 'Source address not authorized');

		const domain = this._getDomainFromRequest(req);

		if (!domain)
			return res.send(484, 'Domain missing');

		const organization = this._organizations.getOrganization(domain);

		if (!organization)
			return res.send(484, 'Missing data for organization');

		// This can throw if you have no rtpengines configured
		const [ error, rtpengine ] = await safeRun(this._rtpengines.getRtpEngine());

		if (error)
			return res.send(503);

		const session = new Session({
			rtpengine,
			organization,
			source,
			srf : this._srf
		});

		session.handleInvite(req, res);

		this._sessions.set(callId, session);
	}

	_getDomainFromRequest(req)
	{
		// Find organization that it belongs to
		const pai = req.get('P-Asserted-Identity');

		let uri;

		if (!pai)
			uri = parseUri(req.uri);
		else
		{
			const uriPattern = /(sips?):([^@]+)(?:@([^>]+))?/i;
			const paiAddress = pai.match(uriPattern)[0];

			uri = parseUri(paiAddress);
		}

		return uri.host;
	}

	get closed()
	{
		return this._closed;
	}
}

module.exports = InviteHandler;