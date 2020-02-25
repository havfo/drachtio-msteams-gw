const Logger = require('../logging/Logger');

const logger = new Logger('Source');

class Source
{
	/**
	 * @private
	 */
	constructor({ address, type, rtpoptions })
	{
		logger.debug('constructor()');

		this._address = address;

		this._type = type;

		this._rtpoptions = rtpoptions;
	}

	get address()
	{
		return this._address;
	}

	get type()
	{
		return this._type;
	}

	get rtpoptions()
	{
		return this._rtpoptions;
	}
}

module.exports = Source;