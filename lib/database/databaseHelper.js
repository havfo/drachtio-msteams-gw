const database = require('./database');

exports.getRtpEngines = async () =>
{
	return new Promise((resolve, reject) =>
	{
		database.query('SELECT * FROM rtpengines', (error, result) =>
		{
			if (error)
				reject(error);
			else
				resolve(result);
		});
	});
};

exports.getDestinations = async (id) =>
{
	return new Promise((resolve, reject) =>
	{
		database.query(`SELECT destination,typeid,destinations.description,organization_destinations.priority,optionsping,rtpoptions FROM organizations,type,destinations,organization_destinations WHERE organization_destinations.organizationid = ${id} AND organization_destinations.organizationid = organizations.id AND organization_destinations.destinationid = destinations.id AND destinations.typeid = type.id`, (error, result) =>
		{
			if (error)
				reject(error);
			else
				resolve(result);
		});
	});
};

exports.getOrganizations = async () =>
{
	return new Promise((resolve, reject) =>
	{
		database.query('SELECT id FROM organizations', (error, result) =>
		{
			if (error)
				reject(error);
			else
				resolve(result);
		});
	});
};

exports.getOrganization = async (id) =>
{
	return new Promise((resolve, reject) =>
	{
		database.query(`SELECT domain FROM organizations WHERE id = ${id}`, (error, result) =>
		{
			if (error)
				reject(error);
			else
				resolve(result);
		});
	});
};

exports.getOrganizationRoutes = async (id) =>
{
	return new Promise((resolve, reject) =>
	{
		database.query(`SELECT inboundtypeid,outboundtypeid,priority FROM organization_routes WHERE organizationid = ${id}`, (error, result) =>
		{
			if (error)
				reject(error);
			else
				resolve(result);
		});
	});
};

exports.getSources = async () =>
{
	return new Promise((resolve, reject) =>
	{
		database.query('SELECT address,typeid,rtpoptions FROM sources,type WHERE type.id = typeid', (error, result) =>
		{
			if (error)
				reject(error);
			else
				resolve(result);
		});
	});
};