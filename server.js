#!/usr/bin/env node

process.title = 'drachtio-msteams-gw';

const config = require('config');
const Srf = require('drachtio-srf');
const InviteHandler = require('./lib/handlers/InviteHandler');
const OptionsHandler = require('./lib/handlers/OptionsHandler');
const Sources = require('./lib/handlers/Sources');
const Organizations = require('./lib/organization/Organizations');
const RtpEngines = require('./lib/rtpengine/RtpEngines');
const sipLogger = require('./lib/logging/sipLogger');
const Logger = require('./lib/logging/Logger');
const interactiveServer = require('./lib/utils/interactiveServer');
const safeRun = require('./lib/utils/safeRun');

/* eslint-disable no-console */
console.log('- process.env.DEBUG:', process.env.DEBUG);
/* eslint-enable no-console */

const srfConfig = config.get('drachtio');
const logger = new Logger();

let srf;

let error;
let rtpengines;
let sources;
let organizations;
let inviteHandler;
let optionsHandler;

async function run()
{
	logger.debug('run() | initializing Srf');
	srf = new Srf();

	logger.debug('run() | loading rtpengines');
	([ error, rtpengines ] = await safeRun(RtpEngines.create()));

	if (error)
		logger.error('run() | error loading rtpengines [error:"%o"]', error);

	logger.debug('run() | loading sources');
	([ error, sources ] = await safeRun(Sources.create()));

	if (error)
		logger.error('run() | error loading sources [error:"%o"]', error);

	logger.debug('run() | loading organizations');
	([ error, organizations ] = await safeRun(Organizations.create({ srf })));

	if (error)
		logger.error('run() | error loading organizations [error:"%o"]', error);

	logger.debug('run() | starting InviteHandler');
	inviteHandler = new InviteHandler({ srf, rtpengines, organizations, sources });

	logger.debug('run() | starting OptionsHandler');
	optionsHandler = new OptionsHandler();

	logger.debug('run() | starting the interactive server');
	await interactiveServer({
		rtpengines,
		inviteHandler,
		optionsHandler,
		organizations,
		sources,
		srf
	});

	logger.debug('run() | starting drachtio server');
	await runSrf();
}

async function runSrf()
{
	srf.on('connect', (err, hostport) =>
	{
		logger.debug('runSrf() | connected to a drachtio server [hostport: "%s"]', hostport);

		if (!organizations.pinging)
			organizations.startPinging();
	});

	srf.on('error', (err) =>
	{
		logger.error('runSrf() | error connecting to drachtio server [error: "%s"]', err);

		if (organizations.pinging)
			organizations.stopPinging();
	});

	if (process.env.SIPTRACE)
	{
		// Log all traffic
		srf.use(sipLogger);
	}

	srf.options(optionsHandler.handleOptions.bind(optionsHandler));

	srf.invite(inviteHandler.handleInvite.bind(inviteHandler));

	srf.connect(srfConfig);
}

run();