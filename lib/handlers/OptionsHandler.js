const EventEmitter = require('events').EventEmitter;
const Logger = require('../logging/Logger');

const logger = new Logger('OptionsHandler');

class OptionsHandler extends EventEmitter
{
	constructor()
	{
		logger.debug('constructor()');
		super();

		this._closed = false;
	}

	close()
	{
		logger.debug('close()');

		this._closed = true;

		this.emit('close');
	}

	async handleOptions(req, res, next)
	{
		// Reply to options
		res.send(200);

		next();
	}

	get closed()
	{
		return this._closed;
	}
}

module.exports = OptionsHandler;