const Logger = require('../logging/Logger');

const logger = new Logger('Route');

class Route
{
	constructor({ from, to, priority })
	{
		logger.debug('constructor()');

		this._from = from;

		this._to = to;

		this._priority = priority;
	}

	get from()
	{
		return this._from;
	}

	get to()
	{
		return this._to;
	}

	get priority()
	{
		return this._priority;
	}
}

module.exports = Route;