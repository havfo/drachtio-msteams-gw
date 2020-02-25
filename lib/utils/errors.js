/**
 * Error produced when calling a method in an invalid state.
 */
class InvalidStateError extends Error
{
	constructor(message)
	{
		super(message);

		this.name = 'InvalidStateError';

		if (Error.hasOwnProperty('captureStackTrace')) // Just in V8.
			Error.captureStackTrace(this, InvalidStateError);
		else
			this.stack = (new Error(message)).stack;
	}
}

module.exports =
{
	InvalidStateError
};