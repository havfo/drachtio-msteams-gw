const Logger = require('./Logger');
const logger = new Logger('sipLogger');

module.exports = async (req, res, next) =>
{
	logger.debug('[req.msg.raw: "%o"]', req.msg.raw);

	next();
};