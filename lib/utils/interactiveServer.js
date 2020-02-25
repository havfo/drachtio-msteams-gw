const os = require('os');
const path = require('path');
const repl = require('repl');
const readline = require('readline');
const net = require('net');
const fs = require('fs');
const colors = require('colors/safe');
const pidusage = require('pidusage');

const SOCKET_PATH_UNIX = '/tmp/drachtio-msteams-gw.sock';
const SOCKET_PATH_WIN = path.join('\\\\?\\pipe', process.cwd(), 'drachtio-msteams-gw');
const SOCKET_PATH = os.platform() === 'win32' ? SOCKET_PATH_WIN : SOCKET_PATH_UNIX;

class Interactive
{
	constructor(socket)
	{
		this._socket = socket;

		this._isTerminalOpen = false;
	}

	openCommandConsole()
	{
		this.log('\n[opening Readline Command Console...]');
		this.log('type help to print available commands');

		const cmd = readline.createInterface(
			{
				input    : this._socket,
				output   : this._socket,
				terminal : true
			});

		cmd.on('close', () =>
		{
			if (this._isTerminalOpen)
				return;

			this.log('\nexiting...');

			this._socket.end();
		});

		const readStdin = () =>
		{
			cmd.question('cmd> ', async (input) =>
			{
				const params = input.split(/[\s\t]+/);
				const command = params.shift();

				switch (command)
				{
					case '':
					{
						readStdin();
						break;
					}

					case 'h':
					case 'help':
					{
						this.log('');
						this.log('available commands:');
						this.log('- h,  help                    : show this message');
						this.log('- usage                       : show CPU and memory usage of the Node.js');
						this.log('- t,  terminal                : open Node REPL Terminal');
						this.log('');
						readStdin();

						break;
					}

					case 'u':
					case 'usage':
					{
						const usage = await pidusage(process.pid);

						this.log(`Node.js process [pid:${process.pid}]:\n${JSON.stringify(usage, null, '  ')}`);

						break;
					}

					case 't':
					case 'terminal':
					{
						this._isTerminalOpen = true;

						cmd.close();
						this.openTerminal();

						return;
					}

					default:
					{
						this.error(`unknown command '${command}'`);
						this.log('press \'h\' or \'help\' to get the list of available commands');
					}
				}

				readStdin();
			});
		};

		readStdin();
	}

	openTerminal()
	{
		this.log('\n[opening Node REPL Terminal...]');
		this.log('here you have access to ES6 maps');

		const terminal = repl.start(
			{
				input           : this._socket,
				output          : this._socket,
				terminal        : true,
				prompt          : 'terminal> ',
				useColors       : true,
				useGlobal       : true,
				ignoreUndefined : false
			});

		this._isTerminalOpen = true;

		terminal.on('exit', () =>
		{
			this.log('\n[exiting Node REPL Terminal...]');

			this._isTerminalOpen = false;

			this.openCommandConsole();
		});
	}

	log(msg)
	{
		this._socket.write(`${colors.green(msg)}\n`);
	}

	error(msg)
	{
		this._socket.write(`${colors.red.bold('ERROR: ')}${colors.red(msg)}\n`);
	}
}

module.exports = async function({
	rtpengines,
	inviteHandler,
	optionsHandler,
	organizations,
	sources,
	srf
})
{
	global.rtpengines = rtpengines;
	global.inviteHandler = inviteHandler;
	global.optionsHandler = optionsHandler;
	global.organizations = organizations;
	global.sources = sources;
	global.srf = srf;

	// Make maps global so they can be used during the REPL terminal.
	const server = net.createServer((socket) =>
	{
		const interactive = new Interactive(socket);

		interactive.openCommandConsole();
	});

	await new Promise((resolve) =>
	{
		try { fs.unlinkSync(SOCKET_PATH); }
		catch (error) {}

		server.listen(SOCKET_PATH, resolve);
	});
};
