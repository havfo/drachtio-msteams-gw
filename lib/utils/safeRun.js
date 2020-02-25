module.exports = async (promise) =>
{
	try
	{
		const data = await Promise.resolve(promise);

		return [ null, data ];
	}
	catch (error)
	{
		return [ error ];
	}
};