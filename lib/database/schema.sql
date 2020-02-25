/*
Example:
INSERT INTO organizations (domain) VALUES ('example.com');
*/
CREATE TABLE IF NOT EXISTS organizations (
	id INT AUTO_INCREMENT PRIMARY KEY,
	domain TEXT
) ENGINE = InnoDB	;

/*
This gives us a mapping for where to send calls based on types.
Example: Organization 'example', call from type 'teams' maps to type 'proxy' with a priority
INSERT INTO organization_routes (organizationid, inboundtypeid, outboundtypeid, priority) VALUES ('1', '2', '1', '5');
*/
CREATE TABLE IF NOT EXISTS organization_routes (
	id INT AUTO_INCREMENT PRIMARY KEY,
	organizationid INT NOT NULL,
	inboundtypeid INT NOT NULL,
	outboundtypeid INT NOT NULL,
	priority INT NOT NULL,
	FOREIGN KEY (organizationid) REFERENCES organizations(id),
	FOREIGN KEY (inboundtypeid) REFERENCES type(id),
	FOREIGN KEY (outboundtypeid) REFERENCES type(id)
) ENGINE = InnoDB;

/*
Example:
INSERT INTO organization_destinations (organizationid, destinationid, priority) VALUES ('1', '2', '5');
*/
CREATE TABLE IF NOT EXISTS organization_destinations (
	id INT AUTO_INCREMENT PRIMARY KEY,
	organizationid INT NOT NULL,
	destinationid INT NOT NULL,
	priority INT NOT NULL,
	optionsping TINYINT(1) DEFAULT '1',
	FOREIGN KEY (organizationid) REFERENCES organizations(id),
	FOREIGN KEY (destinationid) REFERENCES destinations(id)
) ENGINE = InnoDB;

/*
Example:
INSERT INTO destinations (destination, description, typeid) VALUES ('sip:proxy.example.com;transport=tls', 'Microsoft PSTN SBC Europe', '1');
*/
CREATE TABLE IF NOT EXISTS destinations (
	id INT AUTO_INCREMENT PRIMARY KEY,
	destination TEXT NOT NULL,
	description TEXT,
	typeid INT NOT NULL,
	FOREIGN KEY (typeid) REFERENCES type(id)
) ENGINE = InnoDB;

/**
Example:
INSERT INTO sources (address, typeid) VALUES ('127.0.0.1', '1');
*/
CREATE TABLE IF NOT EXISTS sources (
	id INT AUTO_INCREMENT PRIMARY KEY,
	address TEXT NOT NULL,
	typeid INT NOT NULL,
	FOREIGN KEY (typeid) REFERENCES type(id)
) ENGINE = InnoDB;

/**
Examples:
INSERT INTO type (type, description, rtpoptions) VALUES ('proxy', 'SIP Proxy', '{"replace" : ["origin", "session-connection"], "rtcp-mux" : ["demux"], "ICE" : "remove", "DTLS" : "no", "flags" : ["SDES off"], "transport-protocol" : "RTP/AVP"}');
INSERT INTO type (type, description, rtpoptions) VALUES ('teams', 'Microsoft Teams SIP GW', '{"replace" : ["origin", "session-connection"], "rtcp-mux" : ["offer"], "ICE" : "force", "DTLS" : "no", "flags" : ["generate mid"], "transport-protocol" : "RTP/SAVP"}');
*/
CREATE TABLE IF NOT EXISTS type (
	id INT AUTO_INCREMENT PRIMARY KEY,
	type TEXT NOT NULL,
	description TEXT NOT NULL,
	rtpoptions JSON NOT NULL
) ENGINE = InnoDB;

/**
Example:
INSERT into RTPENGINES (host, port) VALUES ('127.0.0.1', '22222');
*/
CREATE TABLE IF NOT EXISTS rtpengines (
	id INT AUTO_INCREMENT PRIMARY KEY,
	host TEXT NOT NULL,
	port SMALLINT UNSIGNED DEFAULT '22222' NOT NULL,
	timeout INT DEFAULT '1500' NOT NULL,
	rejectonfail TINYINT(1) DEFAULT '1'
) ENGINE = InnoDB;